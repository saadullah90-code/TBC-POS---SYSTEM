import type { Request } from "express";

/**
 * Promise wrapper around `req.session.regenerate()`.
 *
 * Always call this on a successful login (BEFORE assigning the user/owner id
 * onto `req.session`) so we issue a brand-new session id and invalidate any
 * previous anonymous session that may have been planted by an attacker
 * (a.k.a. session-fixation defense).
 */
export function regenerateSession(req: Request): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((err: unknown) => {
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      else resolve();
    });
  });
}
