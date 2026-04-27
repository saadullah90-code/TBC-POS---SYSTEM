import type { Request, Response, NextFunction } from "express";

/**
 * Per-IP login rate limiter to slow brute-force attacks against either the
 * staff login or the super-admin owner login. Pure in-memory — no Redis or
 * external store needed. State resets on process restart, which is fine for
 * a POS that boots once a day.
 *
 * Policy:
 *   - More than 5 failed logins inside a sliding 15-minute window per IP →
 *     15-minute lockout.
 *   - Lockout returns HTTP 429 with a human-readable retry hint.
 *   - A successful login clears the IP's record entirely.
 *
 * Identity:
 *   - We trust ONLY `req.ip`, which Express derives from the first
 *     proxy-trusted hop because `app.set("trust proxy", 1)` is enabled.
 *   - We deliberately do NOT read `x-forwarded-for` ourselves: a client can
 *     set arbitrary values there and otherwise rotate identities to evade
 *     the limiter.
 *
 * Usage: mount `loginRateLimit(scope)` BEFORE the login handler, then call
 * `recordLoginFail(req, scope)` on bad password and `recordLoginSuccess(...)`
 * on good password. `scope` ("staff" / "owner") keeps the two counters
 * independent so locking out the owner doesn't block staff and vice versa.
 */

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

interface Entry {
  /** Unix-ms timestamps of failures that are still inside the window. */
  fails: number[];
  /** When non-zero, requests are rejected until this time. */
  lockUntil: number;
}

const buckets = new Map<string, Entry>();

function ipKey(req: Request, scope: string): string {
  // `req.ip` honours `app.set("trust proxy", 1)` so we get the real client
  // IP from the first proxy hop without trusting attacker-controllable
  // headers. Fall back to the raw socket address only if both are missing.
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  return `${scope}:${ip}`;
}

function pruneOld(entry: Entry, now: number): void {
  const cutoff = now - WINDOW_MS;
  while (entry.fails.length && entry.fails[0]! < cutoff) entry.fails.shift();
}

export function loginRateLimit(scope: "staff" | "owner") {
  return function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const key = ipKey(req, scope);
    const entry = buckets.get(key);
    const now = Date.now();
    if (entry && entry.lockUntil > now) {
      const remainingMs = entry.lockUntil - now;
      const remainingMin = Math.max(1, Math.ceil(remainingMs / 60_000));
      res.status(429).json({
        error: "Too many failed attempts",
        message: `Account temporarily locked. Try again in ${remainingMin} minute(s).`,
        retryAfterSec: Math.ceil(remainingMs / 1000),
      });
      return;
    }
    next();
  };
}

export function recordLoginFail(req: Request, scope: "staff" | "owner"): void {
  const key = ipKey(req, scope);
  const now = Date.now();
  const entry = buckets.get(key) ?? { fails: [], lockUntil: 0 };
  pruneOld(entry, now);
  entry.fails.push(now);
  if (entry.fails.length > MAX_FAILS) {
    entry.lockUntil = now + LOCK_MS;
    entry.fails = [];
  }
  buckets.set(key, entry);
}

export function recordLoginSuccess(req: Request, scope: "staff" | "owner"): void {
  buckets.delete(ipKey(req, scope));
}

// Lightweight periodic cleanup so the map doesn't grow unbounded over months.
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    pruneOld(v, now);
    if (v.lockUntil <= now && v.fails.length === 0) buckets.delete(k);
  }
}, CLEANUP_INTERVAL);
cleanup.unref?.();
