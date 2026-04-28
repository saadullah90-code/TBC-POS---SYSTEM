import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateProduct,
  useCreateProductVariant,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import * as z from "zod";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  ClipboardPaste,
  Eraser,
  Ruler,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type RowStatus = "pending" | "saving" | "ok" | "error";

interface SizeEntry {
  size: string;
  stock: number;
}

interface Row {
  id: string;
  name: string;
  title: string;
  price: string;
  category: string;
  stock: string;
  sizes: SizeEntry[];
  status: RowStatus;
  error?: string;
}

const rowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  title: z.string().min(1, "Title is required"),
  price: z.coerce.number().min(0, "Price >= 0"),
  category: z.string().min(1, "Category is required"),
  stock: z.coerce.number().int().min(0, "Stock >= 0"),
});

// Preset palettes for quick multi-select.
//   - CLOTHING: T-shirts / shirts / dresses (XS – XXXL).
//   - NUMBERS:  jeans / trousers / shoes (38 – 48). Anything outside this
//     range can still be added via the Custom input.
const CLOTHING_PRESETS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const NUMERIC_PRESETS = Array.from({ length: 11 }, (_, i) => String(38 + i)); // 38..48

const newId = () => Math.random().toString(36).slice(2, 9);
const blankRow = (): Row => ({
  id: newId(),
  name: "",
  title: "",
  price: "",
  category: "",
  stock: "",
  sizes: [],
  status: "pending",
});

const FIELDS: (keyof Pick<Row, "name" | "title" | "price" | "category" | "stock">)[] = [
  "name",
  "title",
  "price",
  "category",
  "stock",
];

// Effective stock = SUM of variant pieces when sizes exist, else the typed
// number in the Stock cell. The cashier always sees this number because
// it's what flows into the database after import.
const effectiveStockOf = (r: Row): number => {
  if (r.sizes.length > 0) {
    return r.sizes.reduce((s, x) => s + Math.max(0, Math.floor(x.stock || 0)), 0);
  }
  return Number(r.stock || 0);
};

export default function BulkAdd() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createProduct = useCreateProduct();
  const createVariant = useCreateProductVariant();

  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: 5 }, () => blankRow()),
  );
  const [running, setRunning] = useState(false);

  const tableRef = useRef<HTMLDivElement>(null);

  const updateCell = (id: string, field: keyof Row, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, [field]: value, status: r.status === "ok" ? "ok" : "pending", error: undefined }
          : r,
      ),
    );
  };

  const updateSizes = (id: string, sizes: SizeEntry[]) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, sizes, status: r.status === "ok" ? "ok" : "pending", error: undefined }
          : r,
      ),
    );
  };

  const addRow = (count = 1) => {
    setRows((prev) => [...prev, ...Array.from({ length: count }, () => blankRow())]);
    setTimeout(() => tableRef.current?.scrollTo({ top: tableRef.current.scrollHeight, behavior: "smooth" }), 50);
  };

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const clearAll = () => setRows(Array.from({ length: 5 }, () => blankRow()));

  const clearImported = () => setRows((prev) => prev.filter((r) => r.status !== "ok"));

  const isRowEmpty = (r: Row) =>
    !r.name && !r.title && !r.price && !r.category && !r.stock && r.sizes.length === 0;

  /**
   * Smart paste: if the user pastes TSV/CSV from Excel/Sheets into any cell,
   * fan it out across the table starting at that cell.
   */
  const onCellPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    fieldIndex: number,
  ) => {
    const text = e.clipboardData.getData("text");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return; // single value paste
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length > 0);
    const grid = lines.map((l) => (l.includes("\t") ? l.split("\t") : l.split(",")));

    setRows((prev) => {
      const next = [...prev];
      // Ensure enough rows
      while (next.length < rowIndex + grid.length) next.push(blankRow());
      grid.forEach((cells, dr) => {
        const target = next[rowIndex + dr];
        const updated = { ...target, status: "pending" as RowStatus, error: undefined };
        cells.forEach((val, dc) => {
          const fIdx = fieldIndex + dc;
          if (fIdx < FIELDS.length) {
            (updated as any)[FIELDS[fIdx]] = val.trim();
          }
        });
        next[rowIndex + dr] = updated;
      });
      return next;
    });
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast({ variant: "destructive", title: "Clipboard is empty" });
        return;
      }
      const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
      const grid = lines.map((l) => (l.includes("\t") ? l.split("\t") : l.split(",")));
      setRows(() => {
        const next: Row[] = [];
        for (const cells of grid) {
          const r = blankRow();
          FIELDS.forEach((f, i) => {
            (r as any)[f] = (cells[i] ?? "").trim();
          });
          next.push(r);
        }
        // Always leave one empty row at the end for further entry
        next.push(blankRow());
        return next;
      });
      toast({ title: `Pasted ${grid.length} row${grid.length === 1 ? "" : "s"}` });
    } catch {
      toast({
        variant: "destructive",
        title: "Clipboard access denied",
        description: "Paste directly into a cell instead.",
      });
    }
  };

  const handleImport = async () => {
    const candidates = rows.filter((r) => !isRowEmpty(r) && r.status !== "ok");
    if (candidates.length === 0) {
      toast({ variant: "destructive", title: "Nothing to import" });
      return;
    }

    setRunning(true);
    let ok = 0;
    let fail = 0;
    let variantWarnings = 0;

    for (const row of candidates) {
      // Force the persisted Stock column to the variant SUM so dashboard /
      // inventory always show the real count from the very first save.
      const persistedStock = effectiveStockOf(row);

      const parsed = rowSchema.safeParse({
        name: row.name,
        title: row.title,
        price: row.price,
        category: row.category,
        stock: persistedStock,
      });

      if (!parsed.success) {
        fail++;
        const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, status: "error", error: msg } : r)),
        );
        continue;
      }

      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: "saving" } : r)));

      try {
        const created = await createProduct.mutateAsync({ data: parsed.data });

        // Now persist any sizes attached to this row.
        if (row.sizes.length > 0 && created?.id) {
          for (const s of row.sizes) {
            try {
              await createVariant.mutateAsync({
                id: created.id,
                data: {
                  size: s.size.toUpperCase(),
                  stock: Math.max(0, Math.floor(s.stock || 0)),
                },
              });
            } catch (ve: any) {
              variantWarnings++;
              console.error(
                `Variant ${s.size} failed for product ${created.id}:`,
                ve?.error || ve?.message,
              );
            }
          }
        }

        ok++;
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, status: "ok", error: undefined } : r)),
        );
      } catch (e: any) {
        fail++;
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? { ...r, status: "error", error: e?.error || e?.message || "Server error" }
              : r,
          ),
        );
      }
    }

    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
    setRunning(false);
    const description =
      fail > 0
        ? `${fail} row(s) failed — see the table`
        : variantWarnings > 0
          ? `${variantWarnings} size(s) failed to attach — check console`
          : "All rows added.";
    toast({
      title: `Imported ${ok} of ${candidates.length}`,
      description,
      variant: fail > 0 ? "destructive" : "default",
    });
  };

  const filledCount = rows.filter((r) => !isRowEmpty(r)).length;
  const okCount = rows.filter((r) => r.status === "ok").length;
  const errCount = rows.filter((r) => r.status === "error").length;

  return (
    <div className="flex flex-col h-full bg-background p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/inventory")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Bulk Add Products</h2>
            <p className="text-muted-foreground mt-1">
              Type or paste rows into the table — barcodes are generated automatically.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={pasteFromClipboard} disabled={running}>
            <ClipboardPaste className="mr-2 h-4 w-4" /> Paste from Clipboard
          </Button>
          <Button variant="outline" onClick={() => addRow(5)} disabled={running}>
            <Plus className="mr-2 h-4 w-4" /> Add 5 Rows
          </Button>
          <Button onClick={handleImport} disabled={running || filledCount === 0} className="font-semibold">
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Import {filledCount > 0 ? `(${filledCount})` : ""}
          </Button>
        </div>
      </div>

      {/* Stats / actions strip */}
      <div className="flex items-center justify-between bg-card p-3 rounded-lg border border-border shadow-sm text-sm">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            <span className="text-foreground font-semibold">{filledCount}</span> filled
          </span>
          {okCount > 0 && (
            <span className="text-emerald-500 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" /> {okCount} added
            </span>
          )}
          {errCount > 0 && (
            <span className="text-destructive flex items-center gap-1">
              <XCircle className="h-4 w-4" /> {errCount} failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {okCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearImported} disabled={running}>
              Clear imported
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={clearAll} disabled={running}>
            <Eraser className="mr-2 h-4 w-4" /> Reset table
          </Button>
        </div>
      </div>

      {/* Editable table */}
      <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden flex flex-col shadow-sm">
        <ScrollArea className="flex-1" ref={tableRef as any}>
          <Table>
            <TableHeader className="bg-secondary/50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[44px] text-center">#</TableHead>
                <TableHead className="min-w-[220px]">Product Name *</TableHead>
                <TableHead className="min-w-[160px]">Short Title *</TableHead>
                <TableHead className="w-[130px]">Price (PKR) *</TableHead>
                <TableHead className="min-w-[150px]">Category *</TableHead>
                <TableHead className="w-[110px]">Stock *</TableHead>
                <TableHead className="w-[170px]">Sizes</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => {
                const disabled = row.status === "ok" || running;
                const hasSizes = row.sizes.length > 0;
                const computedStock = effectiveStockOf(row);
                return (
                  <TableRow
                    key={row.id}
                    className={
                      row.status === "ok"
                        ? "bg-emerald-500/5"
                        : row.status === "error"
                          ? "bg-destructive/5"
                          : ""
                    }
                  >
                    <TableCell className="text-center text-xs text-muted-foreground font-mono">
                      {rowIndex + 1}
                    </TableCell>
                    {FIELDS.map((field, fieldIndex) => {
                      // When the row has sizes attached, the Stock cell becomes
                      // a read-only computed sum (variant pieces drive it).
                      if (field === "stock" && hasSizes) {
                        return (
                          <TableCell key={field} className="p-1">
                            <div
                              className="h-9 flex items-center justify-center rounded-md bg-secondary/30 border border-border text-sm font-semibold text-foreground"
                              title={`${row.sizes.length} size${row.sizes.length === 1 ? "" : "s"} → ${computedStock} pieces`}
                            >
                              {computedStock}
                            </div>
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell key={field} className="p-1">
                          <Input
                            value={(row as any)[field]}
                            onChange={(e) => updateCell(row.id, field, e.target.value)}
                            onPaste={(e) => onCellPaste(e, rowIndex, fieldIndex)}
                            disabled={disabled}
                            type={field === "price" || field === "stock" ? "number" : "text"}
                            step={field === "price" ? "0.01" : undefined}
                            min={field === "price" || field === "stock" ? 0 : undefined}
                            placeholder={
                              field === "name"
                                ? "Organic Apple"
                                : field === "title"
                                  ? "Apple"
                                  : field === "price"
                                    ? "250"
                                    : field === "category"
                                      ? "Fruits"
                                      : "50"
                            }
                            className="h-9 bg-background"
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell className="p-1">
                      <SizesPopover
                        sizes={row.sizes}
                        disabled={disabled}
                        onChange={(s) => updateSizes(row.id, s)}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusPill status={row.status} error={row.error} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeRow(row.id)}
                        disabled={running}
                        title="Remove row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell colSpan={9} className="text-center py-3">
                  <Button variant="ghost" size="sm" onClick={() => addRow(1)} disabled={running}>
                    <Plus className="mr-2 h-4 w-4" /> Add row
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: copy a block of cells from Excel or Google Sheets and paste into any cell — the data
        will fan out across columns and rows automatically. For sized items (clothing / shoes),
        click the Sizes button to pick presets like XS–XXXL or 38–48 in one go.
      </p>
    </div>
  );
}

function StatusPill({ status, error }: { status: RowStatus; error?: string }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
        <CheckCircle2 className="h-3.5 w-3.5" /> Added
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-destructive cursor-help"
        title={error}
      >
        <XCircle className="h-3.5 w-3.5" />
        {error ? error.slice(0, 22) + (error.length > 22 ? "…" : "") : "Failed"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Clock className="h-3.5 w-3.5" /> Pending
    </span>
  );
}

/**
 * Per-row size manager.
 *  - Two preset palettes (clothing letters, jeans/shoe numbers) — click chips
 *    to multi-select; each newly picked size starts at 1 piece.
 *  - Custom input for anything outside the presets (e.g. "30W", "EUR 42").
 *  - List of selected sizes with a piece input each.
 */
function SizesPopover({
  sizes,
  disabled,
  onChange,
}: {
  sizes: SizeEntry[];
  disabled: boolean;
  onChange: (next: SizeEntry[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const used = new Set(sizes.map((s) => s.size.toUpperCase()));
  const totalPieces = sizes.reduce(
    (s, x) => s + Math.max(0, Math.floor(x.stock || 0)),
    0,
  );

  const togglePreset = (size: string) => {
    const upper = size.toUpperCase();
    if (used.has(upper)) {
      onChange(sizes.filter((s) => s.size.toUpperCase() !== upper));
    } else {
      onChange([...sizes, { size: upper, stock: 1 }]);
    }
  };

  const setStock = (size: string, stock: number) => {
    onChange(
      sizes.map((s) =>
        s.size.toUpperCase() === size.toUpperCase()
          ? { ...s, stock: Math.max(0, Math.floor(stock || 0)) }
          : s,
      ),
    );
  };

  const removeSize = (size: string) => {
    onChange(sizes.filter((s) => s.size.toUpperCase() !== size.toUpperCase()));
  };

  const addCustom = () => {
    const upper = custom.trim().toUpperCase();
    if (!upper) return;
    if (used.has(upper)) {
      setCustom("");
      return;
    }
    onChange([...sizes, { size: upper, stock: 1 }]);
    setCustom("");
  };

  const renderChip = (label: string) => {
    const active = used.has(label.toUpperCase());
    return (
      <button
        key={label}
        type="button"
        onClick={() => togglePreset(label)}
        className={cn(
          "px-2.5 h-7 rounded-md text-xs font-mono font-semibold border transition-colors",
          active
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-secondary text-secondary-foreground border-transparent hover:bg-secondary/70",
        )}
      >
        {label}
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-9 w-full justify-start font-medium"
        >
          <Ruler className="mr-2 h-3.5 w-3.5 text-primary" />
          {sizes.length === 0 ? (
            <span className="text-muted-foreground">Add sizes</span>
          ) : (
            <span>
              {sizes.length} size{sizes.length === 1 ? "" : "s"}{" "}
              <span className="text-muted-foreground">({totalPieces} pcs)</span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(420px,calc(100vw-2rem))] p-0 overflow-y-auto max-h-[min(540px,calc(100vh-6rem))]"
        align="start"
        collisionPadding={12}
        avoidCollisions
      >
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Clothing (T-shirts, shirts, dresses)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CLOTHING_PRESETS.map((s) => renderChip(s))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Numbers (jeans, trousers, shoes)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {NUMERIC_PRESETS.map((s) => renderChip(s))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Custom size
            </p>
            <div className="flex gap-2">
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="e.g. 30W, EUR 42, FREE"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                className="h-8"
              />
              <Button
                type="button"
                size="sm"
                onClick={addCustom}
                disabled={!custom.trim()}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>

          {sizes.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Pieces per size
                </p>
                <span className="text-xs text-muted-foreground">
                  Total: <span className="font-bold text-foreground">{totalPieces}</span>
                </span>
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {sizes.map((s) => (
                  <div key={s.size} className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold w-14 shrink-0 text-foreground">
                      {s.size}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      value={s.stock}
                      onChange={(e) =>
                        setStock(s.size, parseInt(e.target.value || "0", 10))
                      }
                      className="h-8"
                      placeholder="0"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeSize(s.size)}
                      title={`Remove ${s.size}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
