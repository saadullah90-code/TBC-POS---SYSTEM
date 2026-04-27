import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * Super-admin (SaaS owner) accounts. Completely separate from `users`
 * (store staff). Only the owner can manage `licensedClientsTable` and
 * toggle a deployment on/off.
 */
export const ownerUsersTable = pgTable("owner_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OwnerUser = typeof ownerUsersTable.$inferSelect;

/**
 * One row per licensed POS deployment. The currently-running POS reads
 * the FIRST (lowest id) row to determine its license window:
 *   active = isEnabled
 *         AND (startsAt IS NULL OR startsAt <= NOW())
 *         AND (expiresAt IS NULL OR expiresAt >  NOW())
 * If inactive, the POS frontend shows a blocking "subscription" modal.
 */
export const licensedClientsTable = pgTable("licensed_clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact"),
  notes: text("notes"),
  licenseKey: text("license_key").notNull(),
  /** Optional auto-enable date. NULL = enabled immediately. */
  startsAt: timestamp("starts_at", { withTimezone: true }),
  /** Auto-disable date. */
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** Manual master switch. Owner can flip instantly. */
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type LicensedClient = typeof licensedClientsTable.$inferSelect;
