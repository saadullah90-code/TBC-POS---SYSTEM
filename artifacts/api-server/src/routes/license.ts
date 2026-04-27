import { Router, type IRouter } from "express";
import { asc } from "drizzle-orm";
import { db, licensedClientsTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * Public endpoint — POS frontend calls this on every screen to know
 * whether to show the "subscription expired / disabled" blocking modal.
 *
 * status:
 *   - "active"       → POS can be used
 *   - "not_started"  → admin set a future startsAt date that hasn't arrived
 *   - "expired"      → expiresAt has passed
 *   - "disabled"     → admin manually flipped isEnabled = false
 *   - "no_license"   → no license row exists at all (fresh install)
 *
 * We always return 200 so the frontend can read the body.
 *
 * IMPORTANT: this endpoint is anonymous (no auth). It MUST NOT include the
 * licensed-client `contact` field or any other PII — that data lives in the
 * owner-only `/api/${OWNER_PORTAL_SLUG}/clients` listing. We expose only
 * the bits the modal strictly needs to render.
 */
router.get("/license/status", async (_req, res): Promise<void> => {
  const [client] = await db
    .select()
    .from(licensedClientsTable)
    .orderBy(asc(licensedClientsTable.id))
    .limit(1);

  const now = new Date();

  if (!client) {
    res.json({
      status: "no_license",
      active: false,
      message: "No license configured. Contact the headoffice.",
      client: null,
    });
    return;
  }

  let status: "active" | "disabled" | "not_started" | "expired" = "active";
  let message = "License active.";

  if (!client.isEnabled) {
    status = "disabled";
    message = "Your subscription has been disabled. Please contact the headoffice to reactivate.";
  } else if (client.startsAt && client.startsAt > now) {
    status = "not_started";
    message = `Subscription starts on ${client.startsAt.toISOString()}.`;
  } else if (client.expiresAt <= now) {
    status = "expired";
    message = "Your subscription has expired. Please contact the headoffice to renew.";
  }

  res.json({
    status,
    active: status === "active",
    message,
    client: {
      name: client.name,
      // `contact` is intentionally OMITTED — see header comment.
      startsAt: client.startsAt ? client.startsAt.toISOString() : null,
      expiresAt: client.expiresAt.toISOString(),
    },
  });
});

export default router;
