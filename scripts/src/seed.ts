import { db, usersTable, productsTable } from "@workspace/db";
import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(salt + password).digest("hex");
  return `${salt}:${hash}`;
}

const users = [
  { name: "Admin",     email: "admin@store.com",     password: "admin123",     role: "admin"     as const },
  { name: "Cashier",   email: "cashier@store.com",   password: "cashier123",   role: "cashier"   as const },
  { name: "Inventory", email: "inventory@store.com", password: "inventory123", role: "inventory" as const },
];

const products = [
  { name: "coke-330",   title: "Coca-Cola 330ml",      price: 120, category: "Beverages", stock: 50, barcode: "8964000111101" },
  { name: "lays-classic", title: "Lay's Classic 50g",  price: 80,  category: "Snacks",    stock: 80, barcode: "8964000111102" },
  { name: "milk-1l",    title: "Olper's Milk 1L",      price: 320, category: "Dairy",     stock: 30, barcode: "8964000111103" },
  { name: "bread",      title: "Dawn Bread Large",     price: 180, category: "Bakery",    stock: 20, barcode: "8964000111104" },
  { name: "kitkat",     title: "KitKat Chocolate",     price: 150, category: "Snacks",    stock: 40, barcode: "8964000111105" },
];

async function main() {
  console.log("→ Seeding users...");
  for (const u of users) {
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, u.email)).limit(1);
    if (existing.length) {
      console.log(`  · ${u.email} already exists, skipping`);
      continue;
    }
    await db.insert(usersTable).values({
      name: u.name,
      email: u.email,
      passwordHash: hashPassword(u.password),
      role: u.role,
    });
    console.log(`  ✓ ${u.email} (${u.role}) / ${u.password}`);
  }

  console.log("→ Seeding products...");
  for (const p of products) {
    const existing = await db.select().from(productsTable).where(eq(productsTable.barcode, p.barcode)).limit(1);
    if (existing.length) {
      console.log(`  · ${p.title} already exists, skipping`);
      continue;
    }
    await db.insert(productsTable).values(p);
    console.log(`  ✓ ${p.title} (${p.barcode})`);
  }

  console.log("\n✅ Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
