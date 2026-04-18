import { Router, type IRouter } from "express";
import { eq, like, or, sql } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import {
  CreateProductBody,
  UpdateProductBody,
  GetProductParams,
  UpdateProductParams,
  DeleteProductParams,
  GetProductByBarcodeParams,
  ListProductsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatProduct(p: typeof productsTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    title: p.title,
    price: p.price,
    category: p.category,
    stock: p.stock,
    barcode: p.barcode,
    createdAt: p.createdAt.toISOString(),
  };
}

async function generateUniqueBarcode(): Promise<string> {
  while (true) {
    const num = 1000 + Math.floor(Math.random() * 9000);
    const barcode = `PROD-${num}`;
    const [existing] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.barcode, barcode));
    if (!existing) return barcode;
  }
}

router.get("/products/categories", async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ category: productsTable.category })
    .from(productsTable)
    .orderBy(productsTable.category);
  res.json(rows.map((r) => r.category));
});

router.get("/products/barcode/:barcode", async (req, res): Promise<void> => {
  const params = GetProductByBarcodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.barcode, params.data.barcode));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(formatProduct(product));
});

router.get("/products", async (req, res): Promise<void> => {
  const queryParams = ListProductsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  let query = db.select().from(productsTable).$dynamic();

  const conditions = [];
  if (queryParams.data.category) {
    conditions.push(eq(productsTable.category, queryParams.data.category));
  }
  if (queryParams.data.search) {
    const searchTerm = `%${queryParams.data.search}%`;
    conditions.push(
      or(
        like(productsTable.name, searchTerm),
        like(productsTable.title, searchTerm),
        like(productsTable.barcode, searchTerm)
      )!
    );
  }
  if (queryParams.data.lowStock) {
    conditions.push(sql`${productsTable.stock} <= 5`);
  }

  if (conditions.length > 0) {
    const { and } = await import("drizzle-orm");
    query = query.where(and(...conditions));
  }

  const products = await query.orderBy(productsTable.createdAt);
  res.json(products.map(formatProduct));
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const barcode = await generateUniqueBarcode();

  const [product] = await db
    .insert(productsTable)
    .values({ ...parsed.data, barcode })
    .returning();

  res.status(201).json(formatProduct(product));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(formatProduct(product));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db
    .update(productsTable)
    .set(parsed.data)
    .where(eq(productsTable.id, params.data.id))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(formatProduct(product));
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .delete(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
