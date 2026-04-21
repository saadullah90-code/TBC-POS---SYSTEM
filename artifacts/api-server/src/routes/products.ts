import { Router, type IRouter } from "express";
import { eq, like, or, sql, inArray, and } from "drizzle-orm";
import { db, productsTable, productVariantsTable } from "@workspace/db";
import {
  CreateProductBody,
  UpdateProductBody,
  GetProductParams,
  UpdateProductParams,
  DeleteProductParams,
  GetProductByBarcodeParams,
  ListProductsQueryParams,
  CreateProductVariantBody,
  UpdateProductVariantBody,
  CreateProductVariantParams,
  UpdateProductVariantParams,
  DeleteProductVariantParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

type ProductRow = typeof productsTable.$inferSelect;
type VariantRow = typeof productVariantsTable.$inferSelect;

function formatVariant(v: VariantRow) {
  return {
    id: v.id,
    productId: v.productId,
    size: v.size,
    barcode: v.barcode,
    stock: v.stock,
    createdAt: v.createdAt.toISOString(),
  };
}

function formatProduct(p: ProductRow, variants: VariantRow[] = []) {
  return {
    id: p.id,
    name: p.name,
    title: p.title,
    price: p.price,
    category: p.category,
    stock: p.stock,
    barcode: p.barcode,
    createdAt: p.createdAt.toISOString(),
    variants: variants.map(formatVariant),
  };
}

async function loadVariantsByProductIds(
  productIds: number[],
): Promise<Map<number, VariantRow[]>> {
  const map = new Map<number, VariantRow[]>();
  if (productIds.length === 0) return map;
  const rows = await db
    .select()
    .from(productVariantsTable)
    .where(inArray(productVariantsTable.productId, productIds));
  for (const r of rows) {
    const list = map.get(r.productId) ?? [];
    list.push(r);
    map.set(r.productId, list);
  }
  for (const [, list] of map) list.sort((a, b) => a.id - b.id);
  return map;
}

async function generateUniqueProductBarcode(): Promise<string> {
  while (true) {
    const num = 1000 + Math.floor(Math.random() * 9000);
    const barcode = `PROD-${num}`;
    const [a] = await db.select().from(productsTable).where(eq(productsTable.barcode, barcode));
    if (a) continue;
    const [b] = await db
      .select()
      .from(productVariantsTable)
      .where(eq(productVariantsTable.barcode, barcode));
    if (!b) return barcode;
  }
}

async function generateUniqueVariantBarcode(): Promise<string> {
  while (true) {
    const num = 1000 + Math.floor(Math.random() * 9000);
    const barcode = `VAR-${num}`;
    const [a] = await db
      .select()
      .from(productVariantsTable)
      .where(eq(productVariantsTable.barcode, barcode));
    if (a) continue;
    const [b] = await db.select().from(productsTable).where(eq(productsTable.barcode, barcode));
    if (!b) return barcode;
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

  // 1. Try variant barcode first.
  const [variant] = await db
    .select()
    .from(productVariantsTable)
    .where(eq(productVariantsTable.barcode, params.data.barcode));

  if (variant) {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, variant.productId));
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const variantsMap = await loadVariantsByProductIds([product.id]);
    res.json({
      ...formatProduct(product, variantsMap.get(product.id) ?? []),
      matchedVariant: formatVariant(variant),
    });
    return;
  }

  // 2. Fallback to product barcode.
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.barcode, params.data.barcode));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const variantsMap = await loadVariantsByProductIds([product.id]);
  res.json({
    ...formatProduct(product, variantsMap.get(product.id) ?? []),
    matchedVariant: null,
  });
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
        like(productsTable.barcode, searchTerm),
      )!,
    );
  }
  if (queryParams.data.lowStock) {
    conditions.push(sql`${productsTable.stock} <= 5`);
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const products = await query.orderBy(productsTable.createdAt);
  const variantsMap = await loadVariantsByProductIds(products.map((p) => p.id));
  res.json(products.map((p) => formatProduct(p, variantsMap.get(p.id) ?? [])));
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const barcode = await generateUniqueProductBarcode();

  const [product] = await db
    .insert(productsTable)
    .values({ ...parsed.data, barcode })
    .returning();

  res.status(201).json(formatProduct(product, []));
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

  const variantsMap = await loadVariantsByProductIds([product.id]);
  res.json(formatProduct(product, variantsMap.get(product.id) ?? []));
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

  const variantsMap = await loadVariantsByProductIds([product.id]);
  res.json(formatProduct(product, variantsMap.get(product.id) ?? []));
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

// ─────────────────── Variant routes ───────────────────

router.post("/products/:id/variants", async (req, res): Promise<void> => {
  const params = CreateProductVariantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateProductVariantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

  const size = parsed.data.size.trim();
  if (!size) {
    res.status(400).json({ error: "Size is required" });
    return;
  }

  // Reject duplicate size for the same product (case-insensitive).
  const existing = await db
    .select()
    .from(productVariantsTable)
    .where(eq(productVariantsTable.productId, product.id));
  if (existing.some((v) => v.size.toLowerCase() === size.toLowerCase())) {
    res.status(400).json({ error: `Size "${size}" already exists for this product` });
    return;
  }

  const barcode = await generateUniqueVariantBarcode();
  const [variant] = await db
    .insert(productVariantsTable)
    .values({
      productId: product.id,
      size,
      barcode,
      stock: parsed.data.stock,
    })
    .returning();

  res.status(201).json(formatVariant(variant));
});

router.patch("/products/:id/variants/:variantId", async (req, res): Promise<void> => {
  const params = UpdateProductVariantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProductVariantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<{ size: string; stock: number }> = {};
  if (parsed.data.size !== undefined) updates.size = parsed.data.size.trim();
  if (parsed.data.stock !== undefined) updates.stock = parsed.data.stock;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const [variant] = await db
    .update(productVariantsTable)
    .set(updates)
    .where(
      and(
        eq(productVariantsTable.id, params.data.variantId),
        eq(productVariantsTable.productId, params.data.id),
      ),
    )
    .returning();

  if (!variant) {
    res.status(404).json({ error: "Variant not found" });
    return;
  }
  res.json(formatVariant(variant));
});

router.delete("/products/:id/variants/:variantId", async (req, res): Promise<void> => {
  const params = DeleteProductVariantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [variant] = await db
    .delete(productVariantsTable)
    .where(
      and(
        eq(productVariantsTable.id, params.data.variantId),
        eq(productVariantsTable.productId, params.data.id),
      ),
    )
    .returning();

  if (!variant) {
    res.status(404).json({ error: "Variant not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
