import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, ownerUsersTable, licensedClientsTable } from "@workspace/db";
import { hashPassword, verifyPassword } from "../lib/password";
import { invalidateLicenseCache } from "../lib/license-gate";

declare module "express-session" {
  interface SessionData {
    ownerId?: number;
  }
}

const router: IRouter = Router();

// ---------- Validation schemas ----------
const OwnerLoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const CreateClientBody = z.object({
  name: z.string().min(1),
  contact: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  licenseKey: z.string().min(4).optional(),
  startsAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime(),
  isEnabled: z.boolean().optional(),
});

const UpdateClientBody = z.object({
  name: z.string().min(1).optional(),
  contact: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  startsAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional(),
  isEnabled: z.boolean().optional(),
});

// ---------- Middleware ----------
function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.ownerId) {
    res.status(401).json({ error: "Owner authentication required" });
    return;
  }
  next();
}

function formatClient(c: typeof licensedClientsTable.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    contact: c.contact,
    notes: c.notes,
    licenseKey: c.licenseKey,
    startsAt: c.startsAt ? c.startsAt.toISOString() : null,
    expiresAt: c.expiresAt.toISOString(),
    isEnabled: c.isEnabled,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function formatOwner(o: typeof ownerUsersTable.$inferSelect) {
  return {
    id: o.id,
    name: o.name,
    email: o.email,
    createdAt: o.createdAt.toISOString(),
  };
}

function generateLicenseKey(): string {
  const part = () => Math.floor(Math.random() * 0x10000).toString(16).toUpperCase().padStart(4, "0");
  return `BRX-${part()}-${part()}-${part()}`;
}

// ---------- Auth ----------
router.post("/owner/auth/login", async (req, res): Promise<void> => {
  const parsed = OwnerLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;
  const [owner] = await db.select().from(ownerUsersTable).where(eq(ownerUsersTable.email, email));
  if (!owner || !verifyPassword(password, owner.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  req.session.ownerId = owner.id;
  res.json({ owner: formatOwner(owner), message: "Login successful" });
});

router.post("/owner/auth/logout", async (req, res): Promise<void> => {
  // Only clear ownerId so a POS user logged in on the same browser is unaffected
  req.session.ownerId = undefined;
  res.json({ message: "Logged out" });
});

router.get("/owner/auth/me", async (req, res): Promise<void> => {
  if (!req.session.ownerId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const [owner] = await db.select().from(ownerUsersTable).where(eq(ownerUsersTable.id, req.session.ownerId));
  if (!owner) {
    req.session.ownerId = undefined;
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ owner: formatOwner(owner) });
});

router.post("/owner/auth/change-password", requireOwner, async (req, res): Promise<void> => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const ownerId = req.session.ownerId!;
  const [owner] = await db.select().from(ownerUsersTable).where(eq(ownerUsersTable.id, ownerId));
  if (!owner || !verifyPassword(parsed.data.currentPassword, owner.passwordHash)) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  await db
    .update(ownerUsersTable)
    .set({ passwordHash: hashPassword(parsed.data.newPassword) })
    .where(eq(ownerUsersTable.id, ownerId));
  res.json({ message: "Password updated" });
});

// ---------- Clients CRUD ----------
router.get("/owner/clients", requireOwner, async (_req, res): Promise<void> => {
  const rows = await db.select().from(licensedClientsTable).orderBy(licensedClientsTable.id);
  res.json(rows.map(formatClient));
});

router.post("/owner/clients", requireOwner, async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const [row] = await db
    .insert(licensedClientsTable)
    .values({
      name: data.name,
      contact: data.contact ?? null,
      notes: data.notes ?? null,
      licenseKey: data.licenseKey ?? generateLicenseKey(),
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      expiresAt: new Date(data.expiresAt),
      isEnabled: data.isEnabled ?? true,
    })
    .returning();
  invalidateLicenseCache();
  res.status(201).json(formatClient(row));
});

router.patch("/owner/clients/:id", requireOwner, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const update: Partial<typeof licensedClientsTable.$inferInsert> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.contact !== undefined) update.contact = data.contact;
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.startsAt !== undefined) update.startsAt = data.startsAt ? new Date(data.startsAt) : null;
  if (data.expiresAt !== undefined) update.expiresAt = new Date(data.expiresAt);
  if (data.isEnabled !== undefined) update.isEnabled = data.isEnabled;

  const [row] = await db
    .update(licensedClientsTable)
    .set(update)
    .where(eq(licensedClientsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  invalidateLicenseCache();
  res.json(formatClient(row));
});

router.delete("/owner/clients/:id", requireOwner, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .delete(licensedClientsTable)
    .where(eq(licensedClientsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  invalidateLicenseCache();
  res.sendStatus(204);
});

export default router;
