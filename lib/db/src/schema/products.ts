import { pgTable, text, serial, timestamp, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  price: doublePrecision("price").notNull(),
  // When a product is put on discount, `price` becomes the sale price
  // (what the customer pays) and `originalPrice` holds the old price so
  // the barcode label can show it struck through. NULL = no discount.
  originalPrice: doublePrecision("original_price"),
  category: text("category").notNull(),
  stock: integer("stock").notNull().default(0),
  barcode: text("barcode").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
