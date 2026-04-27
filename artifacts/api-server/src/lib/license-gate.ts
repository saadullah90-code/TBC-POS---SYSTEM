import type { Request, Response, NextFunction } from "express";
import { asc } from "drizzle-orm";
import { db, licensedClientsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * SaaS license gate. Blocks state-changing requests (POST / PATCH / PUT /
 * DELETE) on the POS API when the deployment's license row says the
 * subscription is disabled, expired, or not yet started.
 *
 * Read requests (GET / HEAD / OPTIONS) are NEVER blocked so the frontend
 * can still load the screen *behind* the blocking modal — the modal itself
 * polls `/api/license/status` to know whether to render.
 *
 * The middleware fails OPEN on any DB error: a transient Supabase blip must
 * never lock a paying store out of selling. The 30-second cache keeps load
 * negligible (1 query / 30s regardless of API traffic).
 *
 * Mounted in `routes/index.ts` after the public routers (health, auth,
 * owner, license) so those continue to work even when a license expires.
 */

const TTL_MS = 30_000;
let cache: { ts: number; active: boolean; status: string; message: string } | null = null;

async function refresh(): Promise<typeof cache> {
  try {
    const [client] = await db
      .select()
      .from(licensedClientsTable)
      .orderBy(asc(licensedClientsTable.id))
      .limit(1);

    const now = new Date();
    let status: "active" | "disabled" | "not_started" | "expired" | "no_license" = "active";
    let message = "License active.";

    if (!client) {
      status = "no_license";
      message = "No license configured.";
    } else if (!client.isEnabled) {
      status = "disabled";
      message = "Your subscription has been disabled. Please contact the owner to reactivate.";
    } else if (client.startsAt && client.startsAt > now) {
      status = "not_started";
      message = "Subscription is scheduled to start in the future.";
    } else if (client.expiresAt <= now) {
      status = "expired";
      message = "Your subscription has expired. Please contact the owner to renew.";
    }

    cache = { ts: Date.now(), active: status === "active", status, message };
    return cache;
  } catch (err) {
    logger.warn({ err }, "License gate failed to read DB — failing open");
    // Cache a permissive entry briefly so we don't hammer the DB while it's down
    cache = { ts: Date.now(), active: true, status: "active", message: "fail-open" };
    return cache;
  }
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function licenseGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (READ_METHODS.has(req.method)) {
    next();
    return;
  }

  const fresh = !cache || Date.now() - cache.ts > TTL_MS;
  const entry = fresh ? await refresh() : cache;

  if (entry && !entry.active) {
    res.status(403).json({
      error: "License inactive",
      status: entry.status,
      message: entry.message,
    });
    return;
  }
  next();
}

/** Force the gate to re-read on the very next request. Call after any
 *  write to `licensed_clients` so the owner toggling on/off sees an
 *  immediate effect on the POS instead of waiting up to 30s. */
export function invalidateLicenseCache(): void {
  cache = null;
}
