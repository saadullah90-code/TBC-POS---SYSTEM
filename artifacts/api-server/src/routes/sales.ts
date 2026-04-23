import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, salesTable, productsTable, productVariantsTable, usersTable } from "@workspace/db";
import {
  CreateSaleBody,
  GetSaleParams,
  ListSalesQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatSale(sale: typeof salesTable.$inferSelect, cashierName?: string | null) {
  return {
    id: sale.id,
    items: sale.items,
    totalAmount: sale.totalAmount,
    cashierId: sale.cashierId,
    cashierName: cashierName ?? null,
    customerName: sale.customerName ?? null,
    createdAt: sale.createdAt.toISOString(),
  };
}

router.get("/sales", async (req, res): Promise<void> => {
  // Require auth so an expired session immediately surfaces a 401 to the
  // frontend (which redirects to /login) instead of silently showing stale
  // data while admin-only actions like DELETE /sales fail with "Not
  // authenticated" — a confusing combination that previously made it look
  // like the delete button was broken.
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const queryParams = ListSalesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  let query = db.select().from(salesTable).$dynamic();

  const { period, cashierId } = queryParams.data;

  const conditions = [];
  if (period && period !== "all") {
    const now = new Date();
    let since: Date;
    if (period === "today") {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === "week") {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      since = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    conditions.push(sql`${salesTable.createdAt} >= ${since.toISOString()}`);
  }

  if (cashierId) {
    conditions.push(eq(salesTable.cashierId, cashierId));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const sales = await query.orderBy(sql`${salesTable.createdAt} DESC`);

  const cashierIds = [...new Set(sales.map((s) => s.cashierId))];
  const { inArray } = await import("drizzle-orm");
  const cashiers =
    cashierIds.length > 0
      ? await db.select().from(usersTable).where(inArray(usersTable.id, cashierIds))
      : [];
  const cashierMap = Object.fromEntries(cashiers.map((u) => [u.id, u.name]));

  res.json(sales.map((s) => formatSale(s, cashierMap[s.cashierId])));
});

router.post("/sales", async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { items, cashierId, customerName } = parsed.data;

  const productIds = [...new Set(items.map((i) => i.productId))];
  const variantIds = [
    ...new Set(items.map((i) => i.variantId).filter((v): v is number => typeof v === "number")),
  ];

  const { inArray } = await import("drizzle-orm");
  const products = await db
    .select()
    .from(productsTable)
    .where(inArray(productsTable.id, productIds));
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  const variants =
    variantIds.length > 0
      ? await db
          .select()
          .from(productVariantsTable)
          .where(inArray(productVariantsTable.id, variantIds))
      : [];
  const variantMap = Object.fromEntries(variants.map((v) => [v.id, v]));

  const saleItems: Array<{
    productId: number;
    productName: string;
    barcode: string;
    price: number;
    quantity: number;
    subtotal: number;
    variantId?: number | null;
    size?: string | null;
  }> = [];

  for (const item of items) {
    const product = productMap[item.productId];
    if (!product) {
      res.status(400).json({ error: `Product ${item.productId} not found` });
      return;
    }

    if (item.variantId != null) {
      const variant = variantMap[item.variantId];
      if (!variant || variant.productId !== product.id) {
        res.status(400).json({ error: `Variant ${item.variantId} not found for product ${product.id}` });
        return;
      }
      if (variant.stock < item.quantity) {
        res.status(400).json({
          error: `Insufficient stock for "${product.name}" (size ${variant.size}). Available: ${variant.stock}, requested: ${item.quantity}`,
        });
        return;
      }
      saleItems.push({
        productId: product.id,
        productName: product.name,
        barcode: variant.barcode,
        price: product.price,
        quantity: item.quantity,
        subtotal: product.price * item.quantity,
        variantId: variant.id,
        size: variant.size,
      });
    } else {
      if (product.stock < item.quantity) {
        res.status(400).json({
          error: `Insufficient stock for "${product.name}". Available: ${product.stock}, requested: ${item.quantity}`,
        });
        return;
      }
      saleItems.push({
        productId: product.id,
        productName: product.name,
        barcode: product.barcode,
        price: product.price,
        quantity: item.quantity,
        subtotal: product.price * item.quantity,
        variantId: null,
        size: null,
      });
    }
  }

  const totalAmount = saleItems.reduce((sum, i) => sum + i.subtotal, 0);

  // Decrement stock — variant stock if variant sale, else product stock.
  for (const item of saleItems) {
    if (item.variantId != null) {
      await db
        .update(productVariantsTable)
        .set({ stock: sql`${productVariantsTable.stock} - ${item.quantity}` })
        .where(eq(productVariantsTable.id, item.variantId));
    } else {
      await db
        .update(productsTable)
        .set({ stock: sql`${productsTable.stock} - ${item.quantity}` })
        .where(eq(productsTable.id, item.productId));
    }
  }

  const [sale] = await db
    .insert(salesTable)
    .values({
      items: saleItems,
      totalAmount,
      cashierId,
      customerName: customerName?.trim() ? customerName.trim() : null,
    })
    .returning();

  const [cashier] = await db.select().from(usersTable).where(eq(usersTable.id, cashierId));

  res.status(201).json(formatSale(sale, cashier?.name ?? null));
});

/**
 * Wipe ALL sales records. Admin-only. Used by the "Clear Sale History"
 * button on the Sales History page. This does NOT restock inventory —
 * stock that was decremented at sale time stays decremented (clearing
 * history is a bookkeeping reset, not an order reversal).
 */
router.delete("/sales", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin role required to clear sales history" });
    return;
  }

  const deleted = await db.delete(salesTable).returning({ id: salesTable.id });
  res.json({ deleted: deleted.length });
});

router.get("/sales/:id", async (req, res): Promise<void> => {
  const params = GetSaleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, params.data.id));
  if (!sale) {
    res.status(404).json({ error: "Sale not found" });
    return;
  }

  const [cashier] = await db.select().from(usersTable).where(eq(usersTable.id, sale.cashierId));

  res.json(formatSale(sale, cashier?.name ?? null));
});

export default router;
