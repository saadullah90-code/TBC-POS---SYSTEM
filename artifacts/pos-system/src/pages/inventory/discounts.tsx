import { useEffect, useMemo, useRef, useState } from "react";
import {
  useListProducts,
  useUpdateProduct,
  type Product,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tag,
  Search,
  ScanLine,
  Plus,
  X,
  Printer,
  Loader2,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { silentPrintBarcodeLabels } from "@/lib/silent-barcode";
import type { LabelSpec } from "@/lib/pdf/barcode-pdf";

function formatCurrency(n: number) {
  return `Rs. ${Number(n || 0).toLocaleString("en-PK", {
    maximumFractionDigits: 2,
  })}`;
}

// One row in the working list. We keep the productId + a draft sale price
// the user is editing. The original price is auto-set to the product's current
// `price` (the price BEFORE discount) when the row is added, but only if the
// product is not already discounted — in that case we keep the existing
// originalPrice so we don't lose the original ticket value.
interface DraftRow {
  productId: number;
  // What the user wants the new sale price to become
  newPrice: number | "";
}

export default function Discounts() {
  const { data: products, isLoading } = useListProducts({});
  const updateProduct = useUpdateProduct();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [scan, setScan] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkPrice, setBulkPrice] = useState<string>("");
  const [copies, setCopies] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Map of productId -> Product, for quick lookup when rendering rows
  const byId = useMemo(() => {
    const m = new Map<number, Product>();
    for (const p of products ?? []) m.set(p.id, p);
    return m;
  }, [products]);

  // Search results — only when there's a query
  const searchResults = useMemo(() => {
    if (!search.trim()) return [] as Product[];
    const q = search.trim().toLowerCase();
    return (products ?? [])
      .filter((p) => {
        if (rows.some((r) => r.productId === p.id)) return false;
        return (
          p.name.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          (p.variants ?? []).some((v) =>
            v.barcode.toLowerCase().includes(q),
          )
        );
      })
      .slice(0, 8);
  }, [products, search, rows]);

  // Try to focus the scan input on mount so a barcode scanner just works
  useEffect(() => {
    scanInputRef.current?.focus();
  }, []);

  const addProduct = (p: Product) => {
    if (rows.some((r) => r.productId === p.id)) {
      toast({ title: "Already in list", description: p.name });
      return;
    }
    setRows((prev) => [...prev, { productId: p.id, newPrice: "" }]);
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    // Match by product barcode OR variant barcode
    const product = (products ?? []).find(
      (p) =>
        p.barcode === code ||
        (p.variants ?? []).some((v) => v.barcode === code),
    );
    if (!product) {
      toast({
        variant: "destructive",
        title: "Not found",
        description: `No product matches barcode "${code}"`,
      });
    } else {
      addProduct(product);
      toast({ title: "Added", description: product.name });
    }
    setScan("");
    scanInputRef.current?.focus();
  };

  const removeRow = (productId: number) => {
    setRows((prev) => prev.filter((r) => r.productId !== productId));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
  };

  const updateRowPrice = (productId: number, newPrice: number | "") => {
    setRows((prev) =>
      prev.map((r) =>
        r.productId === productId ? { ...r, newPrice } : r,
      ),
    );
  };

  const toggleSelect = (productId: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(productId);
      else next.delete(productId);
      return next;
    });
  };

  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.productId));
  const toggleSelectAll = (checked: boolean) => {
    if (checked) setSelected(new Set(rows.map((r) => r.productId)));
    else setSelected(new Set());
  };

  const applyBulkPrice = () => {
    const v = Number(bulkPrice);
    if (!bulkPrice || !Number.isFinite(v) || v < 0) {
      toast({
        variant: "destructive",
        title: "Enter a valid discount price",
      });
      return;
    }
    if (selected.size === 0) {
      toast({
        variant: "destructive",
        title: "Select at least one product first",
      });
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        selected.has(r.productId) ? { ...r, newPrice: v } : r,
      ),
    );
    toast({
      title: "Applied",
      description: `Discount price ${formatCurrency(v)} applied to ${selected.size} product(s)`,
    });
  };

  // Determine which rows are "ready" — i.e. have a valid new price strictly
  // less than the existing sale price, so applying actually creates a (deeper)
  // discount. This matches the per-row hint "Must be lower than current price".
  const readyRows = useMemo(() => {
    return rows
      .map((r) => {
        const p = byId.get(r.productId);
        if (!p) return null;
        const newPrice = typeof r.newPrice === "number" ? r.newPrice : NaN;
        if (!Number.isFinite(newPrice) || newPrice <= 0) return null;
        if (newPrice >= p.price) return null;
        return { product: p, newPrice };
      })
      .filter((x): x is { product: Product; newPrice: number } => x != null);
  }, [rows, byId]);

  const saveAll = async () => {
    if (readyRows.length === 0) {
      toast({
        variant: "destructive",
        title: "Nothing to save",
        description: "Set a discount price (less than current price) on at least one product.",
      });
      return;
    }
    setSaving(true);
    let ok = 0;
    let fail = 0;
    for (const { product, newPrice } of readyRows) {
      // The pre-discount price to keep on the label as the struck-through value:
      // - if the product was never on discount, that's its current `price`
      // - if it was already discounted, keep the existing `originalPrice`
      const orig =
        product.originalPrice != null && product.originalPrice > product.price
          ? product.originalPrice
          : product.price;
      try {
        await updateProduct.mutateAsync({
          id: product.id,
          data: {
            name: product.name,
            title: product.title,
            category: product.category,
            stock: product.stock,
            price: newPrice,
            originalPrice: orig,
          },
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setSaving(false);
    if (fail === 0) {
      toast({
        title: "Discounts saved",
        description: `${ok} product(s) updated`,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Some updates failed",
        description: `${ok} succeeded, ${fail} failed`,
      });
    }
  };

  // Print labels for either the "ready" rows (preview of pending discount), or
  // — when nothing is pending — for the products as they are currently saved
  // (so user can re-print labels for already discounted products).
  const handlePrintLabels = () => {
    // Decide which products to print labels for: prefer rows that have a
    // pending new price; fall back to all listed rows for already-discounted
    // products.
    const targets: Array<{
      product: Product;
      effectivePrice: number;
      originalPrice: number | null;
    }> = [];

    for (const r of rows) {
      const p = byId.get(r.productId);
      if (!p) continue;
      const newPrice = typeof r.newPrice === "number" ? r.newPrice : NaN;
      if (Number.isFinite(newPrice) && newPrice > 0 && newPrice < p.price) {
        // Pending discount — use the pending values
        const orig =
          p.originalPrice != null && p.originalPrice > p.price
            ? p.originalPrice
            : p.price;
        targets.push({ product: p, effectivePrice: newPrice, originalPrice: orig });
      } else if (
        p.originalPrice != null &&
        p.originalPrice > p.price
      ) {
        // Already-discounted — print as-is
        targets.push({
          product: p,
          effectivePrice: p.price,
          originalPrice: p.originalPrice,
        });
      }
    }

    if (targets.length === 0) {
      toast({
        variant: "destructive",
        title: "No discounted labels to print",
        description:
          "Set a new (lower) price on a product, or add already discounted products.",
      });
      return;
    }

    const labels: LabelSpec[] = targets.flatMap(
      ({ product, effectivePrice, originalPrice }) => {
        if (product.variants && product.variants.length > 0) {
          return product.variants.map((v) => ({
            name: product.name,
            title: product.title,
            price: effectivePrice,
            barcode: v.barcode,
            size: v.size as string | null,
            originalPrice,
          }));
        }
        return [
          {
            name: product.name,
            title: product.title,
            price: effectivePrice,
            barcode: product.barcode,
            size: null,
            originalPrice,
          },
        ];
      },
    );

    // Fallback URL just lists the product ids so the bulk page can render
    // their CURRENT (saved) values. Note: if the user hasn't pressed Save Discounts
    // yet, the fallback page will show the OLD price — only the silent path
    // honors the pending pricing. We surface this in the button tooltip.
    const ids = targets.map((t) => t.product.id).join(",");
    const fallbackUrl = `/inventory/barcode-print-bulk?ids=${ids}&copies=${copies}`;
    void silentPrintBarcodeLabels(labels, fallbackUrl, copies);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Discounts</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Scan or search products, set a discount price (in bulk if needed),
            then save and print updated barcode labels with the original price
            struck through.
          </p>
        </div>
      </div>

      {/* Scan + Search */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-primary" /> Scan Barcode
            </CardTitle>
            <CardDescription>
              Scan a product or variant barcode to add it to the list below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleScanSubmit} className="flex gap-2">
              <Input
                ref={scanInputRef}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                placeholder="Scan or type barcode..."
                autoComplete="off"
              />
              <Button type="submit" variant="default">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" /> Search Products
            </CardTitle>
            <CardDescription>
              Search by name, title or barcode and pick from results.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type at least one character..."
              autoComplete="off"
            />
            {search.trim() && (
              <div className="border border-border rounded-lg max-h-56 overflow-y-auto divide-y divide-border">
                {isLoading && (
                  <div className="p-3 text-sm text-muted-foreground">Loading...</div>
                )}
                {!isLoading && searchResults.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">
                    No matches.
                  </div>
                )}
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      addProduct(p);
                      setSearch("");
                    }}
                    className="w-full text-left p-3 hover:bg-muted/50 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.title} · {p.barcode}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {p.originalPrice != null && p.originalPrice > p.price ? (
                        <div className="leading-tight">
                          <div className="text-[11px] text-muted-foreground line-through">
                            {formatCurrency(p.originalPrice)}
                          </div>
                          <div className="text-emerald-500 font-semibold text-sm">
                            {formatCurrency(p.price)}
                          </div>
                        </div>
                      ) : (
                        <div className="font-medium text-sm">
                          {formatCurrency(p.price)}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bulk apply */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bulk Apply Discount Price</CardTitle>
          <CardDescription>
            Select rows below, type a new sale price, and apply it to all selected products.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-muted-foreground">
                New sale price (PKR)
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g. 6000"
                value={bulkPrice}
                onChange={(e) => setBulkPrice(e.target.value)}
              />
            </div>
            <Button onClick={applyBulkPrice} variant="secondary">
              Apply to selected ({selected.size})
            </Button>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Copies/label</label>
              <Input
                type="number"
                min={1}
                className="w-20"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Working list */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Working List</CardTitle>
            <CardDescription>
              {rows.length === 0
                ? "Scan or search products above to start adding them here."
                : `${rows.length} product(s) in list · ${readyRows.length} ready to save`}
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              onClick={handlePrintLabels}
              disabled={rows.length === 0}
              title="Prints labels for products with a pending discount, or for already-discounted products in the list."
            >
              <Printer className="h-4 w-4 mr-1" /> Print Labels
            </Button>
            <Button
              onClick={saveAll}
              disabled={saving || readyRows.length === 0}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Discounts ({readyRows.length})
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 text-center border border-dashed border-border rounded-lg">
              No products yet. Scan a barcode or search above.
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(v) => toggleSelectAll(Boolean(v))}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="text-right">Current Price</TableHead>
                    <TableHead className="text-right w-44">
                      New Sale Price
                    </TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const p = byId.get(r.productId);
                    if (!p) {
                      return (
                        <TableRow key={r.productId}>
                          <TableCell colSpan={6} className="text-muted-foreground text-sm">
                            (Product no longer available)
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-2"
                              onClick={() => removeRow(r.productId)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    const isDiscounted =
                      p.originalPrice != null && p.originalPrice > p.price;
                    const newPriceNum =
                      typeof r.newPrice === "number" ? r.newPrice : NaN;
                    const isReady =
                      Number.isFinite(newPriceNum) &&
                      newPriceNum > 0 &&
                      newPriceNum < p.price;
                    return (
                      <TableRow key={r.productId}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(r.productId)}
                            onCheckedChange={(v) =>
                              toggleSelect(r.productId, Boolean(v))
                            }
                            aria-label={`Select ${p.name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.title}
                            {isDiscounted && (
                              <Badge
                                variant="outline"
                                className="ml-2 text-[10px] py-0 px-1.5 border-emerald-500/40 text-emerald-500"
                              >
                                Already on discount
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {p.barcode}
                        </TableCell>
                        <TableCell className="text-right">
                          {isDiscounted ? (
                            <div className="leading-tight">
                              <div className="text-[11px] text-muted-foreground line-through">
                                {formatCurrency(p.originalPrice!)}
                              </div>
                              <div className="text-emerald-500 font-semibold">
                                {formatCurrency(p.price)}
                              </div>
                            </div>
                          ) : (
                            <span className="font-medium">
                              {formatCurrency(p.price)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="New price"
                            value={r.newPrice === "" ? "" : String(r.newPrice)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "") {
                                updateRowPrice(r.productId, "");
                              } else {
                                const n = Number(v);
                                updateRowPrice(
                                  r.productId,
                                  Number.isFinite(n) ? n : "",
                                );
                              }
                            }}
                            className={
                              r.newPrice !== "" && !isReady
                                ? "border-amber-500/60"
                                : ""
                            }
                          />
                          {r.newPrice !== "" && !isReady && (
                            <div className="text-[10px] text-amber-500 mt-1 text-left">
                              Must be lower than current price
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeRow(r.productId)}
                            title="Remove from list"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
