import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, salesTable, productsTable, usersTable } from "@workspace/db";
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
    createdAt: sale.createdAt.toISOString(),
  };
}

router.get("/sales", async (req, res): Promise<void> => {
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
    const { and } = await import("drizzle-orm");
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

  const { items, cashierId } = parsed.data;

  const productIds = items.map((i) => i.productId);
  const { inArray } = await import("drizzle-orm");
  const products = await db
    .select()
    .from(productsTable)
    .where(inArray(productsTable.id, productIds));

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  const saleItems: Array<{
    productId: number;
    productName: string;
    barcode: string;
    price: number;
    quantity: number;
    subtotal: number;
  }> = [];

  for (const item of items) {
    const product = productMap[item.productId];
    if (!product) {
      res.status(400).json({ error: `Product ${item.productId} not found` });
      return;
    }
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
    });
  }

  const totalAmount = saleItems.reduce((sum, i) => sum + i.subtotal, 0);

  for (const item of saleItems) {
    await db
      .update(productsTable)
      .set({ stock: sql`${productsTable.stock} - ${item.quantity}` })
      .where(eq(productsTable.id, item.productId));
  }

  const [sale] = await db
    .insert(salesTable)
    .values({ items: saleItems, totalAmount, cashierId })
    .returning();

  const [cashier] = await db.select().from(usersTable).where(eq(usersTable.id, cashierId));

  res.status(201).json(formatSale(sale, cashier?.name ?? null));
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
