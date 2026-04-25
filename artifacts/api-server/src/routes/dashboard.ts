import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, salesTable, productsTable, productVariantsTable } from "@workspace/db";
import {
  GetDashboardSummaryQueryParams,
  GetSalesChartQueryParams,
  GetTopProductsQueryParams,
  GetLowStockProductsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function getPeriodStart(period?: string): Date {
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === "week") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const queryParams = GetDashboardSummaryQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const since = getPeriodStart(queryParams.data.period ?? "month");

  const [salesStats] = await db
    .select({
      totalRevenue: sql<number>`COALESCE(SUM(${salesTable.totalAmount}), 0)`,
      totalOrders: sql<number>`COUNT(*)`,
    })
    .from(salesTable)
    .where(sql`${salesTable.createdAt} >= ${since.toISOString()}`);

  const [productStats] = await db
    .select({
      totalProducts: sql<number>`COUNT(*)`,
      // Variant-aware: a sized product's real on-hand is SUM of its variants;
      // products.stock is unused for sized products. COALESCE falls back to
      // products.stock for plain non-sized items.
      lowStockCount: sql<number>`COUNT(*) FILTER (WHERE COALESCE((SELECT SUM(${productVariantsTable.stock}) FROM ${productVariantsTable} WHERE ${productVariantsTable.productId} = ${productsTable.id}), ${productsTable.stock}) <= 5)`,
    })
    .from(productsTable);

  const totalRevenue = Number(salesStats?.totalRevenue ?? 0);
  const totalOrders = Number(salesStats?.totalOrders ?? 0);

  res.json({
    totalRevenue,
    totalOrders,
    totalProducts: Number(productStats?.totalProducts ?? 0),
    lowStockCount: Number(productStats?.lowStockCount ?? 0),
    avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
  });
});

router.get("/dashboard/sales-chart", async (req, res): Promise<void> => {
  const queryParams = GetSalesChartQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const days = queryParams.data.days ?? 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      date: sql<string>`DATE(${salesTable.createdAt})::text`,
      revenue: sql<number>`COALESCE(SUM(${salesTable.totalAmount}), 0)`,
      orders: sql<number>`COUNT(*)`,
    })
    .from(salesTable)
    .where(sql`${salesTable.createdAt} >= ${since.toISOString()}`)
    .groupBy(sql`DATE(${salesTable.createdAt})`)
    .orderBy(sql`DATE(${salesTable.createdAt})`);

  const dateMap = Object.fromEntries(rows.map((r) => [r.date, r]));
  const result: Array<{ date: string; revenue: number; orders: number }> = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split("T")[0];
    const row = dateMap[dateStr];
    result.push({
      date: dateStr,
      revenue: row ? Number(row.revenue) : 0,
      orders: row ? Number(row.orders) : 0,
    });
  }

  res.json(result);
});

router.get("/dashboard/top-products", async (req, res): Promise<void> => {
  const queryParams = GetTopProductsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const since = getPeriodStart(queryParams.data.period ?? "month");
  const limit = queryParams.data.limit ?? 5;

  const sales = await db
    .select()
    .from(salesTable)
    .where(sql`${salesTable.createdAt} >= ${since.toISOString()}`);

  const productTotals: Record<number, { name: string; qty: number; revenue: number }> = {};

  for (const sale of sales) {
    for (const item of sale.items as Array<{
      productId: number;
      productName: string;
      quantity: number;
      subtotal: number;
    }>) {
      if (!productTotals[item.productId]) {
        productTotals[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
      }
      productTotals[item.productId].qty += item.quantity;
      productTotals[item.productId].revenue += item.subtotal;
    }
  }

  const topProducts = Object.entries(productTotals)
    .map(([productId, data]) => ({
      productId: Number(productId),
      productName: data.name,
      totalQuantity: data.qty,
      totalRevenue: data.revenue,
    }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity)
    .slice(0, Number(limit));

  res.json(topProducts);
});

router.get("/dashboard/low-stock", async (req, res): Promise<void> => {
  const queryParams = GetLowStockProductsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const threshold = queryParams.data.threshold ?? 5;

  // For sized products (clothing / shoes) the real on-hand quantity lives in
  // product_variants — the parent products.stock column stays at its initial
  // value (often 0) and would otherwise mask the actual variant total.
  // Compute an "effective" stock = SUM(variants.stock) when variants exist,
  // else products.stock; then both the WHERE filter and the returned `stock`
  // field reflect what the cashier actually sees on the floor.
  const effectiveStock = sql<number>`COALESCE((SELECT SUM(${productVariantsTable.stock}) FROM ${productVariantsTable} WHERE ${productVariantsTable.productId} = ${productsTable.id}), ${productsTable.stock})`;

  const products = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      title: productsTable.title,
      price: productsTable.price,
      category: productsTable.category,
      stock: effectiveStock,
      barcode: productsTable.barcode,
      createdAt: productsTable.createdAt,
    })
    .from(productsTable)
    .where(sql`${effectiveStock} <= ${threshold}`)
    .orderBy(effectiveStock);

  res.json(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      title: p.title,
      price: p.price,
      category: p.category,
      stock: Number(p.stock ?? 0),
      barcode: p.barcode,
      createdAt: p.createdAt.toISOString(),
    }))
  );
});

export default router;
