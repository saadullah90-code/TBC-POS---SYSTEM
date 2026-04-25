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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  IndianRupee,
  Eraser,
  Pencil,
  TagIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { silentPrintBarcodeLabels } from "@/lib/silent-barcode";
import type { LabelSpec } from "@/lib/pdf/barcode-pdf";

function formatCurrency(n: number) {
  return `Rs. ${Number(n || 0).toLocaleString("en-PK", {
    maximumFractionDigits: 2,
  })}`;
}

type Mode = "discount" | "edit" | "remove";

interface DraftRow {
  productId: number;
  newPrice: number | "";
}

export default function Discounts() {
  const { data: products, isLoading } = useListProducts({});
  const updateProduct = useUpdateProduct();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("discount");
  const [search, setSearch] = useState("");
  const [priceSearch, setPriceSearch] = useState("");
  const [scan, setScan] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkPrice, setBulkPrice] = useState<string>("");
  const [copies, setCopies] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Map of productId -> Product for quick lookup
  const byId = useMemo(() => {
    const m = new Map<number, Product>();
    for (const p of products ?? []) m.set(p.id, p);
    return m;
  }, [products]);

  // When the mode changes, clear any draft new prices so an old discount
  // value doesn't get re-applied as an "edit" or vice versa.
  useEffect(() => {
    setRows((prev) => prev.map((r) => ({ ...r, newPrice: "" })));
    setBulkPrice("");
  }, [mode]);

  // Text search results — by name/title/barcode
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

  // Price search results — match by current price OR original price
  const priceSearchResults = useMemo(() => {
    const q = priceSearch.trim();
    if (!q) return [] as Product[];
    const target = Number(q);
    if (!Number.isFinite(target)) return [] as Product[];
    return (products ?? []).filter((p) => {
      if (rows.some((r) => r.productId === p.id)) return false;
      return p.price === target || p.originalPrice === target;
    });
  }, [products, priceSearch, rows]);

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

  const addAllPriceMatches = () => {
    if (priceSearchResults.length === 0) return;
    const toAdd = priceSearchResults.filter(
      (p) => !rows.some((r) => r.productId === p.id),
    );
    if (toAdd.length === 0) {
      toast({ title: "All matches already in list" });
      return;
    }
    setRows((prev) => [
      ...prev,
      ...toAdd.map((p) => ({ productId: p.id, newPrice: "" as number | "" })),
    ]);
    toast({
      title: "Added",
      description: `${toAdd.length} product(s) matching ${formatCurrency(
        Number(priceSearch),
      )}`,
    });
    setPriceSearch("");
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
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

  const clearList = () => {
    setRows([]);
    setSelected(new Set());
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

  // Apply the bulk price input to all selected rows. Used in 'discount' and
  // 'edit' modes — 'remove' has its own one-click button (no price needed).
  const applyBulkPrice = () => {
    const v = Number(bulkPrice);
    if (!bulkPrice || !Number.isFinite(v) || v < 0) {
      toast({
        variant: "destructive",
        title: "Enter a valid price",
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
      description: `${formatCurrency(v)} applied to ${selected.size} product(s)`,
    });
  };

  // Resolve the effective new price for a row, falling back to the bulk
  // price field when the row is selected and has no per-row value yet. This
  // matches the user's mental model: "type a price, select rows, press Save".
  const resolveNewPrice = (r: DraftRow): number => {
    const own = typeof r.newPrice === "number" ? r.newPrice : NaN;
    if (Number.isFinite(own)) return own;
    if (selected.has(r.productId)) {
      const bulk = Number(bulkPrice);
      if (bulkPrice !== "" && Number.isFinite(bulk)) return bulk;
    }
    return NaN;
  };

  // Determine which rows are "ready" — ready means the row will produce a
  // valid update on save, given the active mode.
  const readyRows = useMemo(() => {
    return rows
      .map((r) => {
        const p = byId.get(r.productId);
        if (!p) return null;

        if (mode === "discount") {
          // Discount: new price must be > 0 and strictly less than current
          const np = resolveNewPrice(r);
          if (!Number.isFinite(np) || np <= 0) return null;
          if (np >= p.price) return null;
          return { product: p, newPrice: np };
        }

        if (mode === "edit") {
          // Edit price: new price must be > 0 and different from current
          const np = resolveNewPrice(r);
          if (!Number.isFinite(np) || np <= 0) return null;
          if (np === p.price) return null;
          return { product: p, newPrice: np };
        }

        // mode === "remove": ready only if the product currently has a discount
        if (p.originalPrice != null && p.originalPrice > p.price) {
          return { product: p, newPrice: p.originalPrice };
        }
        return null;
      })
      .filter((x): x is { product: Product; newPrice: number } => x != null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, byId, mode, selected, bulkPrice]);

  const saveAll = async () => {
    if (readyRows.length === 0) {
      const msg =
        mode === "discount"
          ? "Set a discount price (less than current price) on at least one product."
          : mode === "edit"
            ? "Enter a new price (different from current) on at least one product."
            : "No discounted products in the list. Add some that have a discount applied.";
      toast({
        variant: "destructive",
        title: "Nothing to save",
        description: msg,
      });
      return;
    }

    setSaving(true);
    let ok = 0;
    let fail = 0;

    for (const { product, newPrice } of readyRows) {
      try {
        const data: {
          name: string;
          title: string;
          category: string;
          stock: number;
          price: number;
          originalPrice: number | null;
        } = {
          name: product.name,
          title: product.title,
          category: product.category,
          stock: product.stock,
          price: product.price,
          originalPrice: product.originalPrice ?? null,
        };

        if (mode === "discount") {
          // Keep the pre-discount price as originalPrice. If the product was
          // already discounted, preserve the existing originalPrice so we don't
          // lose the original ticket value.
          const orig =
            product.originalPrice != null && product.originalPrice > product.price
              ? product.originalPrice
              : product.price;
          data.price = newPrice;
          data.originalPrice = orig;
        } else if (mode === "edit") {
          // Just change the actual price. Clear any discount marker so the
          // displayed price is the real one (no strikethrough left over).
          data.price = newPrice;
          data.originalPrice = null;
        } else {
          // Remove discount: restore price back to originalPrice and clear it.
          data.price = newPrice; // newPrice == originalPrice for ready rows
          data.originalPrice = null;
        }

        await updateProduct.mutateAsync({ id: product.id, data });
        ok++;
      } catch {
        fail++;
      }
    }

    setSaving(false);

    if (fail === 0) {
      const verb =
        mode === "discount"
          ? "Discounts saved"
          : mode === "edit"
            ? "Prices updated"
            : "Discounts removed";
      toast({ title: verb, description: `${ok} product(s) updated` });
      // Clear pending values so the next round starts fresh
      setRows((prev) => prev.map((r) => ({ ...r, newPrice: "" })));
      setSelected(new Set());
    } else {
      toast({
        variant: "destructive",
        title: "Some updates failed",
        description: `${ok} succeeded, ${fail} failed`,
      });
    }
  };

  // Print labels for the rows that have a pending discount (in 'discount'
  // mode) OR for the rows that are already discounted (any mode).
  const handlePrintLabels = () => {
    const targets: Array<{
      product: Product;
      effectivePrice: number;
      originalPrice: number | null;
    }> = [];

    for (const r of rows) {
      const p = byId.get(r.productId);
      if (!p) continue;
      const newPrice = resolveNewPrice(r);
      if (
        mode === "discount" &&
        Number.isFinite(newPrice) &&
        newPrice > 0 &&
        newPrice < p.price
      ) {
        const orig =
          p.originalPrice != null && p.originalPrice > p.price
            ? p.originalPrice
            : p.price;
        targets.push({ product: p, effectivePrice: newPrice, originalPrice: orig });
      } else if (p.originalPrice != null && p.originalPrice > p.price) {
        targets.push({
          product: p,
          effectivePrice: p.price,
          originalPrice: p.originalPrice,
        });
      } else if (mode === "edit") {
        // For plain price edits, print a normal label (no strikethrough)
        const eff =
          Number.isFinite(newPrice) && newPrice > 0 ? newPrice : p.price;
        targets.push({ product: p, effectivePrice: eff, originalPrice: null });
      }
    }

    if (targets.length === 0) {
      toast({
        variant: "destructive",
        title: "Nothing to print",
        description:
          "Add products and set a price (or include already discounted ones).",
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

    const ids = targets.map((t) => t.product.id).join(",");
    const fallbackUrl = `/inventory/barcode-print-bulk?ids=${ids}&copies=${copies}`;
    void silentPrintBarcodeLabels(labels, fallbackUrl, copies);
  };

  // ---- UI helpers --------------------------------------------------------

  const modeMeta: Record<
    Mode,
    {
      title: string;
      desc: string;
      saveLabel: string;
      bulkLabel: string;
      bulkPlaceholder: string;
      Icon: typeof Tag;
    }
  > = {
    discount: {
      title: "Add Discount",
      desc: "Set a sale price (lower than current) on one or many products.",
      saveLabel: "Save Discounts",
      bulkLabel: "Bulk discount price (PKR)",
      bulkPlaceholder: "e.g. 6000",
      Icon: TagIcon,
    },
    edit: {
      title: "Edit Price",
      desc: "Change the actual ticket price up or down. No discount marker is kept.",
      saveLabel: "Save New Prices",
      bulkLabel: "Bulk new price (PKR)",
      bulkPlaceholder: "e.g. 9500",
      Icon: Pencil,
    },
    remove: {
      title: "Remove Discount",
      desc: "Restore the original ticket price on already discounted products.",
      saveLabel: "Remove Discounts",
      bulkLabel: "(no price needed)",
      bulkPlaceholder: "—",
      Icon: Eraser,
    },
  };

  const meta = modeMeta[mode];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Discounts</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Add or remove discounts and edit prices in bulk. Search by name,
            barcode or by exact price.
          </p>
        </div>
      </div>

      {/* Mode selector */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList className="grid grid-cols-3 w-full max-w-2xl">
          <TabsTrigger value="discount" className="gap-2">
            <TagIcon className="h-4 w-4" /> Add Discount
          </TabsTrigger>
          <TabsTrigger value="edit" className="gap-2">
            <Pencil className="h-4 w-4" /> Edit Price
          </TabsTrigger>
          <TabsTrigger value="remove" className="gap-2">
            <Eraser className="h-4 w-4" /> Remove Discount
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Mode summary */}
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <meta.Icon className="h-4 w-4 text-primary" />
        <span className="font-medium text-foreground">{meta.title}:</span>
        <span>{meta.desc}</span>
      </div>

      {/* Search inputs: scan + name + price */}
      <div className="grid md:grid-cols-3 gap-4">
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
              <Search className="h-4 w-4 text-primary" /> Search by Name
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
                  <div className="p-3 text-sm text-muted-foreground">
                    Loading...
                  </div>
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-primary" /> Search by Price
            </CardTitle>
            <CardDescription>
              Type an exact price (e.g. 8500) to list every product at that price.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={priceSearch}
                onChange={(e) => setPriceSearch(e.target.value)}
                placeholder="e.g. 8500"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addAllPriceMatches}
                disabled={priceSearchResults.length === 0}
              >
                Add all ({priceSearchResults.length})
              </Button>
            </div>
            {priceSearch.trim() && (
              <div className="border border-border rounded-lg max-h-56 overflow-y-auto divide-y divide-border">
                {isLoading && (
                  <div className="p-3 text-sm text-muted-foreground">
                    Loading...
                  </div>
                )}
                {!isLoading && priceSearchResults.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">
                    No products at that price.
                  </div>
                )}
                {priceSearchResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
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

      {/* Bulk action bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {mode === "remove" ? "Remove Discounts" : "Bulk Apply Price"}
          </CardTitle>
          <CardDescription>
            {mode === "remove"
              ? 'Add already-discounted products to the list below, then press "Remove Discounts" to restore their original prices.'
              : "Select rows below, type a price, and apply it to all selected products."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            {mode !== "remove" && (
              <>
                <div className="flex-1 min-w-[180px]">
                  <label className="text-xs text-muted-foreground">
                    {meta.bulkLabel}
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={meta.bulkPlaceholder}
                    value={bulkPrice}
                    onChange={(e) => setBulkPrice(e.target.value)}
                  />
                </div>
                <Button onClick={applyBulkPrice} variant="secondary">
                  Apply to selected ({selected.size})
                </Button>
              </>
            )}

            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">
                Copies/label
              </label>
              <Input
                type="number"
                min={1}
                className="w-20"
                value={copies}
                onChange={(e) =>
                  setCopies(Math.max(1, Number(e.target.value) || 1))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Working list */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Working List</CardTitle>
            <CardDescription>
              {rows.length === 0
                ? "Scan, search by name or search by price above to start adding products here."
                : `${rows.length} product(s) in list · ${readyRows.length} ready to save`}
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            {rows.length > 0 && (
              <Button
                variant="ghost"
                onClick={clearList}
                title="Clear the working list"
              >
                <X className="h-4 w-4 mr-1" /> Clear list
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handlePrintLabels}
              disabled={rows.length === 0}
              title="Print labels for the products in the list"
            >
              <Printer className="h-4 w-4 mr-1" /> Print Labels
            </Button>
            <Button
              onClick={saveAll}
              disabled={saving || readyRows.length === 0}
              variant={mode === "remove" ? "destructive" : "default"}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {meta.saveLabel} ({readyRows.length})
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 text-center border border-dashed border-border rounded-lg">
              No products yet. Scan a barcode, search by name, or search by
              price above.
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
                      {mode === "discount"
                        ? "New Sale Price"
                        : mode === "edit"
                          ? "New Price"
                          : "Will Restore To"}
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
                          <TableCell
                            colSpan={6}
                            className="text-muted-foreground text-sm"
                          >
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

                    let isReady = false;
                    let hint: string | null = null;
                    if (mode === "discount") {
                      isReady =
                        Number.isFinite(newPriceNum) &&
                        newPriceNum > 0 &&
                        newPriceNum < p.price;
                      if (r.newPrice !== "" && !isReady)
                        hint = "Must be lower than current price";
                    } else if (mode === "edit") {
                      isReady =
                        Number.isFinite(newPriceNum) &&
                        newPriceNum > 0 &&
                        newPriceNum !== p.price;
                      if (r.newPrice !== "" && !isReady)
                        hint = "Enter a positive price different from current";
                    } else {
                      // remove mode
                      isReady = isDiscounted;
                    }

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
                                On discount
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
                          {mode === "remove" ? (
                            isDiscounted ? (
                              <span className="font-semibold">
                                {formatCurrency(p.originalPrice!)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Not on discount
                              </span>
                            )
                          ) : (
                            <>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder={
                                  mode === "discount" ? "Sale price" : "New price"
                                }
                                value={
                                  r.newPrice === "" ? "" : String(r.newPrice)
                                }
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
                              {hint && (
                                <div className="text-[10px] text-amber-500 mt-1 text-left">
                                  {hint}
                                </div>
                              )}
                            </>
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
