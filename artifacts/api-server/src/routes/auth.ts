import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody } from "@workspace/api-zod";
import { hashPassword, verifyPassword } from "../lib/password";
import { loginRateLimit, recordLoginFail, recordLoginSuccess } from "../lib/rate-limit";
import { regenerateSession } from "../lib/regenerate-session";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

const router: IRouter = Router();

router.post("/auth/login", loginRateLimit("staff"), async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!user || !verifyPassword(password, user.passwordHash)) {
    recordLoginFail(req, "staff");
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  recordLoginSuccess(req, "staff");
  // Rotate the session id BEFORE we attach `userId` so any pre-login
  // session a malicious actor may have planted in the browser becomes
  // useless (session-fixation defense).
  try {
    await regenerateSession(req);
  } catch {
    res.status(500).json({ error: "Could not establish session" });
    return;
  }
  req.session.userId = user.id;

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
    message: "Login successful",
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  // Only clear the staff `userId` so a super-admin (`ownerId`) signed in
  // on the same browser is NOT also kicked out. A full `req.session.destroy`
  // would wipe both fields and surprise the owner mid-action.
  req.session.userId = undefined;
  res.json({ message: "Logged out successfully" });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  });
});

export { hashPassword };
export default router;
