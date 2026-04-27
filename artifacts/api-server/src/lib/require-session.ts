import type { Request, Response, NextFunction } from "express";

/**
 * Hard authentication gate for POS staff endpoints.
 *
 * Until we added this, the API was effectively public — any browser/curl
 * could read `/api/products`, `/api/users`, `/api/sales` etc. Staff routes
 * now sit behind this middleware so the same `req.session.userId` cookie
 * that the React app uses is mandatory for both reads and writes.
 *
 * Owner / license / health / auth routes do NOT use this — they handle
 * their own access (no auth, owner auth, or login itself).
 */
export function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
