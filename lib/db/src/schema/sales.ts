import { pgTable, serial, timestamp, integer, doublePrecision, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const salesTable = pgTable("sales", {
  id: serial("id").primaryKey(),
  items: jsonb("items").notNull().$type<Array<{
    productId: number;
    productName: string;
    barcode: string;
    price: number;
    quantity: number;
    subtotal: number;
  }>>(),
  totalAmount: doublePrecision("total_amount").notNull(),
  cashierId: integer("cashier_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSaleSchema = createInsertSchema(salesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof salesTable.$inferSelect;
