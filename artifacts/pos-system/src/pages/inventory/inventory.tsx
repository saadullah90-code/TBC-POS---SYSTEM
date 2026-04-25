import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useCreateProductVariant,
  useUpdateProductVariant,
  useDeleteProductVariant,
  getListProductsQueryKey,
  Product,
  ProductVariant,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Printer,
  Edit,
  Trash2,
  Loader2,
  PackageSearch,
  Upload,
  Printer as PrinterIcon,
  Ruler,
  X,
  Check,
  ClipboardList,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { printDocument } from "@/lib/print";
import { silentPrintBarcodeLabels } from "@/lib/silent-barcode";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  title: z.string().min(1, "Title is required"),
  price: z.coerce.number().min(0, "Price must be >= 0"),
  category: z.string().min(1, "Category is required"),
  stock: z.coerce.number().int().min(0, "Stock must be >= 0"),
});

const PRESET_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

function buildBarcodePrintUrl(
  name: string,
  title: string,
  price: number,
  barcode: string,
  size?: string | null,
) {
  const params = new URLSearchParams({
    name,
    title,
    price: String(price),
  });
  if (size) params.set("size", size);
  return `/inventory/barcode-print/${barcode}?${params.toString()}`;
}

// A pending size entered while creating a brand new product (before it has an id)
interface PendingSize {
  size: string;
  stock: number;
}

/**
 * Section embedded inside the Add/Edit Product dialog.
 * - When `product` is null (new product), sizes are staged locally and created
 *   AFTER the product is saved.
 * - When `product` exists, sizes are persisted immediately via the API.
 */
function SizesSection({
  product,
  pendingSizes,
  setPendingSizes,
}: {
  product: Product | null;
  pendingSizes: PendingSize[];
  setPendingSizes: (next: PendingSize[]) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newSize, setNewSize] = useState("");
  const [customSize, setCustomSize] = useState("");
  const [newStock, setNewStock] = useState<number>(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStock, setEditStock] = useState<number>(0);

  const createVariant = useCreateProductVariant();
  const updateVariant = useUpdateProductVariant();
  const deleteVariant = useDeleteProductVariant();

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });

  const existingVariants: ProductVariant[] = product?.variants ?? [];
  const usedSizes = new Set<string>([
    ...existingVariants.map((v) => v.size.toUpperCase()),
    ...pendingSizes.map((p) => p.size.toUpperCase()),
  ]);
  const availablePresets = PRESET_SIZES.filter((s) => !usedSizes.has(s));

  const resolveNewSize = () =>
    (newSize === "__custom__" ? customSize : newSize).trim().toUpperCase();

  const handleAdd = () => {
    const size = resolveNewSize();
    if (!size) {
      toast({ variant: "destructive", title: "Pick or type a size first" });
      return;
    }
    if (usedSizes.has(size)) {
      toast({ variant: "destructive", title: `Size ${size} already exists` });
      return;
    }
    const stock = Math.max(0, Math.floor(newStock || 0));

    if (!product) {
      // Stage locally until product is created
      setPendingSizes([...pendingSizes, { size, stock }]);
      setNewSize("");
      setCustomSize("");
      setNewStock(0);
      return;
    }

    createVariant.mutate(
      { id: product.id, data: { size, stock } },
      {
        onSuccess: () => {
          refresh();
          setNewSize("");
          setCustomSize("");
          setNewStock(0);
          toast({ title: `Size ${size} added`, description: "Unique barcode generated." });
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Could not add size",
            description: err?.error || "Unknown error",
          });
        },
      },
    );
  };

  const handleSaveStock = (variant: ProductVariant) => {
    if (!product) return;
    updateVariant.mutate(
      {
        id: product.id,
        variantId: variant.id,
        data: { stock: Math.max(0, Math.floor(editStock || 0)) },
      },
      {
        onSuccess: () => {
          refresh();
          setEditingId(null);
          toast({ title: "Stock updated" });
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Could not update stock",
            description: err?.error || "Unknown error",
          });
        },
      },
    );
  };

  const handleDeleteExisting = (variant: ProductVariant) => {
    if (!product) return;
    if (!confirm(`Delete size ${variant.size}? This cannot be undone.`)) return;
    deleteVariant.mutate(
      { id: product.id, variantId: variant.id },
      {
        onSuccess: () => {
          refresh();
          toast({ title: `Size ${variant.size} removed` });
        },
      },
    );
  };

  const handleDeletePending = (size: string) => {
    setPendingSizes(pendingSizes.filter((p) => p.size !== size));
  };

  const handlePrintAll = () => {
    if (!product || existingVariants.length === 0) return;
    const variantIds = existingVariants.map((v) => v.id).join(",");
    const labels = existingVariants.map((v) => ({
      name: product.name,
      title: product.title,
      price: product.price,
      barcode: v.barcode,
      size: v.size,
    }));
    void silentPrintBarcodeLabels(
      labels,
      `/inventory/barcode-print-bulk?variantIds=${variantIds}&copies=1`,
      1,
    );
  };

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <div className="flex items-center justify-between pt-3">
        <div className="flex items-center gap-2">
          <Ruler className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-sm">Sizes (optional)</h4>
          <span className="text-[11px] text-muted-foreground">
            for clothing &amp; shoes
          </span>
        </div>
        {product && existingVariants.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handlePrintAll}
          >
            <PrinterIcon className="h-3 w-3 mr-1" /> Print all labels
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Each size gets its own unique barcode and stock. Leave empty for non-sized items
        (food, drinks, etc.) — initial stock above will be used instead.
      </p>

      {/* Add-size row */}
      <div className="flex flex-wrap items-end gap-2 rounded-md bg-secondary/40 p-2">
        <div className="min-w-[100px] flex-1">
          <label className="text-[11px] text-muted-foreground">Size</label>
          <Select value={newSize} onValueChange={setNewSize}>
            <SelectTrigger className="h-8 bg-background text-sm">
              <SelectValue placeholder="Pick…" />
            </SelectTrigger>
            <SelectContent>
              {availablePresets.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
              <SelectItem value="__custom__">Custom…</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {newSize === "__custom__" && (
          <div className="min-w-[100px] flex-1">
            <label className="text-[11px] text-muted-foreground">Custom</label>
            <Input
              placeholder="e.g. 42"
              value={customSize}
              onChange={(e) => setCustomSize(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        )}
        <div className="w-[80px]">
          <label className="text-[11px] text-muted-foreground">Stock</label>
          <Input
            type="number"
            min={0}
            value={newStock}
            onChange={(e) => setNewStock(parseInt(e.target.value || "0", 10) || 0)}
            className="h-8 text-sm"
          />
        </div>
        <Button
          type="button"
          onClick={handleAdd}
          disabled={createVariant.isPending}
          className="h-8 text-sm"
        >
          {createVariant.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3 mr-1" />
          )}
          Add
        </Button>
      </div>

      {/* Existing variants (saved) */}
      {existingVariants.length > 0 && (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-1.5 font-medium">Size</th>
                <th className="text-left px-3 py-1.5 font-medium">Barcode</th>
                <th className="text-right px-3 py-1.5 font-medium">Stock</th>
                <th className="text-right px-3 py-1.5 font-medium w-[110px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {existingVariants.map((v) => {
                const isEditing = editingId === v.id;
                const isOut = v.stock <= 0;
                return (
                  <tr key={v.id} className="border-t border-border">
                    <td className="px-3 py-1.5">
                      <Badge variant="outline" className="font-mono">
                        {v.size}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5">
                      <code className="px-1.5 py-0.5 bg-secondary rounded text-[11px] font-mono">
                        {v.barcode}
                      </code>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          min={0}
                          value={editStock}
                          onChange={(e) =>
                            setEditStock(parseInt(e.target.value || "0", 10) || 0)
                          }
                          className="h-7 w-16 ml-auto text-sm"
                        />
                      ) : (
                        <Badge
                          variant={isOut ? "destructive" : v.stock <= 5 ? "secondary" : "outline"}
                        >
                          {isOut ? "Sold out" : v.stock}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex justify-end gap-0.5">
                        {isEditing ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary"
                              onClick={() => handleSaveStock(v)}
                              disabled={updateVariant.isPending}
                              title="Save"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setEditingId(null)}
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={() =>
                                void silentPrintBarcodeLabels(
                                  [
                                    {
                                      name: product!.name,
                                      title: product!.title,
                                      price: product!.price,
                                      barcode: v.barcode,
                                      size: v.size,
                                    },
                                  ],
                                  buildBarcodePrintUrl(
                                    product!.name,
                                    product!.title,
                                    product!.price,
                                    v.barcode,
                                    v.size,
                                  ),
                                  1,
                                )
                              }
                              title="Print barcode"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={() => {
                                setEditingId(v.id);
                                setEditStock(v.stock);
                              }}
                              title="Edit stock"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteExisting(v)}
                              title="Delete size"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending (un-saved) sizes for new products */}
      {pendingSizes.length > 0 && (
        <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-2 space-y-1">
          <div className="text-[11px] font-semibold text-primary uppercase tracking-wider">
            Will be created with the product
          </div>
          {pendingSizes.map((p) => (
            <div
              key={p.size}
              className="flex items-center justify-between text-sm py-1"
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono">
                  {p.size}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  stock {p.stock}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => handleDeletePending(p.size)}
                title="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Inventory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [pendingSizes, setPendingSizes] = useState<PendingSize[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [copiesPerLabel, setCopiesPerLabel] = useState<number>(1);
  const [inventoryCheckOpen, setInventoryCheckOpen] = useState(false);
  const [checkSearch, setCheckSearch] = useState("");
  const [checkCategory, setCheckCategory] = useState<string>("all");
  const [, setLocation] = useLocation();

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useListProducts({
    search: searchTerm || undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
  });

  // Re-resolve the editing product from the freshly fetched list so the dialog's
  // SizesSection always reflects the latest variants after add/edit/delete.
  const liveEditingProduct =
    editingProduct && products
      ? products.find((p) => p.id === editingProduct.id) ?? editingProduct
      : editingProduct;

  const categories = Array.from(new Set(products?.map((p) => p.category) || [])).filter(Boolean);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const createVariant = useCreateProductVariant();

  const form = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", title: "", price: 0, category: "", stock: 0 },
  });

  useEffect(() => {
    if (editingProduct) {
      form.reset({
        name: editingProduct.name,
        title: editingProduct.title,
        price: editingProduct.price,
        category: editingProduct.category,
        stock: editingProduct.stock,
      });
    }
  }, [editingProduct, form]);

  const handleEditClick = (product: Product) => {
    setEditingProduct(product);
    setPendingSizes([]);
  };

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setPendingSizes([]);
    form.reset({ name: "", title: "", price: 0, category: "", stock: 0 });
    setIsAddOpen(true);
  };

  const closeDialog = () => {
    setIsAddOpen(false);
    setEditingProduct(null);
    setPendingSizes([]);
  };

  const onSubmit = (values: z.infer<typeof productSchema>) => {
    if (editingProduct) {
      updateProduct.mutate(
        { id: editingProduct.id, data: values },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
            closeDialog();
            toast({ title: "Product updated successfully" });
          },
          onError: (err: any) => {
            toast({
              variant: "destructive",
              title: "Error updating product",
              description: err?.error || "Unknown error",
            });
          },
        },
      );
    } else {
      createProduct.mutate(
        { data: values },
        {
          onSuccess: async (newProduct) => {
            // Persist any sizes the user staged in the dialog
            if (pendingSizes.length > 0) {
              try {
                await Promise.all(
                  pendingSizes.map((p) =>
                    createVariant.mutateAsync({
                      id: newProduct.id,
                      data: { size: p.size, stock: p.stock },
                    }),
                  ),
                );
                toast({
                  title: "Product created",
                  description: `${pendingSizes.length} size${
                    pendingSizes.length === 1 ? "" : "s"
                  } added.`,
                });
              } catch (e: any) {
                toast({
                  variant: "destructive",
                  title: "Product created, but some sizes failed",
                  description: e?.error || "Please add them again from Edit.",
                });
              }
            } else {
              toast({ title: "Product added successfully" });
            }
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
            closeDialog();
          },
          onError: (err: any) => {
            toast({
              variant: "destructive",
              title: "Error adding product",
              description: err?.error || "Unknown error",
            });
          },
        },
      );
    }
  };

  const toggleSelect = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!products) return;
    if (checked) setSelectedIds(new Set(products.map((p) => p.id)));
    else setSelectedIds(new Set());
  };

  const handlePrintSelected = () => {
    if (selectedIds.size === 0) {
      toast({ variant: "destructive", title: "No products selected" });
      return;
    }
    const ids = Array.from(selectedIds).join(",");
    const fallbackUrl = `/inventory/barcode-print-bulk?ids=${ids}&copies=${copiesPerLabel}`;
    // Build the flat list of labels (one per variant when sized, else one per product)
    // for the silent path. The fallback URL handles things if no printer is set up.
    const selectedProducts = (products ?? []).filter((p) => selectedIds.has(p.id));
    const labels: import("@/lib/pdf/barcode-pdf").LabelSpec[] = selectedProducts.flatMap((p) => {
      if (p.variants && p.variants.length > 0) {
        return p.variants.map((v) => ({
          name: p.name,
          title: p.title,
          price: p.price,
          barcode: v.barcode,
          size: v.size as string | null,
        }));
      }
      return [
        {
          name: p.name,
          title: p.title,
          price: p.price,
          barcode: p.barcode,
          size: null as string | null,
        },
      ];
    });
    void silentPrintBarcodeLabels(labels, fallbackUrl, copiesPerLabel);
  };

  const handleDelete = (id: number) => {
    if (
      confirm("Are you sure you want to delete this product? All its sizes will be removed too.")
    ) {
      deleteProduct.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
            toast({ title: "Product deleted successfully" });
          },
        },
      );
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "PKR" }).format(amount);

  return (
    <div className="flex flex-col h-full bg-background p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground mt-1">
            Manage products, sizes, stock levels, and barcodes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setInventoryCheckOpen(true)}
            className="font-semibold"
          >
            <ClipboardList className="mr-2 h-4 w-4" /> Inventory Check
          </Button>
          <Button
            variant="outline"
            onClick={() => setLocation("/inventory/bulk-add")}
            className="font-semibold"
          >
            <Upload className="mr-2 h-4 w-4" /> Bulk Add
          </Button>
          <Button onClick={handleOpenAdd} className="font-semibold">
            <Plus className="mr-2 h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-card p-3 rounded-lg border border-primary/40 shadow-sm">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-foreground">{selectedIds.size}</span>
            <span className="text-muted-foreground">
              product{selectedIds.size === 1 ? "" : "s"} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground flex items-center gap-2">
              Copies per label
              <Input
                type="number"
                min={1}
                value={copiesPerLabel}
                onChange={(e) =>
                  setCopiesPerLabel(Math.max(1, parseInt(e.target.value || "1", 10) || 1))
                }
                className="h-8 w-20"
              />
            </label>
            <Button onClick={handlePrintSelected} className="font-semibold">
              <PrinterIcon className="mr-2 h-4 w-4" />
              Print labels (sizes expanded)
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            className="pl-9 bg-background"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px] bg-background">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden flex flex-col shadow-sm">
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader className="bg-secondary/50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={
                      !!products &&
                      products.length > 0 &&
                      products.every((p) => selectedIds.has(p.id))
                    }
                    onCheckedChange={(c) => toggleSelectAll(!!c)}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="w-[160px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
                      Loading inventory...
                    </div>
                  </TableCell>
                </TableRow>
              ) : products?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <PackageSearch className="h-12 w-12 mb-4 opacity-20" />
                      <p className="text-lg font-medium">No products found</p>
                      <p className="text-sm">Try adjusting your search or filters</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                products?.map((product) => {
                  const variants = product.variants ?? [];
                  const hasVariants = variants.length > 0;
                  const totalVariantStock = variants.reduce((s, v) => s + v.stock, 0);
                  const allOut = hasVariants && totalVariantStock === 0;
                  const displayedStock = hasVariants ? totalVariantStock : product.stock;
                  return (
                    <TableRow
                      key={product.id}
                      className={`hover:bg-secondary/20 transition-colors ${
                        selectedIds.has(product.id) ? "bg-primary/5" : ""
                      }`}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={(c) => toggleSelect(product.id, !!c)}
                          aria-label={`Select ${product.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.title}</div>
                        {hasVariants && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {variants.slice(0, 6).map((v) => (
                              <span
                                key={v.id}
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                  v.stock <= 0
                                    ? "border-destructive/40 text-destructive line-through"
                                    : "border-border text-muted-foreground"
                                }`}
                                title={`${v.size} • stock ${v.stock} • ${v.barcode}`}
                              >
                                {v.size}
                              </span>
                            ))}
                            {variants.length > 6 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{variants.length - 6}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <code className="px-2 py-1 bg-secondary rounded text-xs text-muted-foreground font-mono">
                          {product.barcode}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-background/50">
                          {product.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(product.price)}
                      </TableCell>
                      <TableCell className="text-right">
                        {hasVariants ? (
                          <Badge
                            variant={
                              allOut ? "destructive" : displayedStock <= 5 ? "secondary" : "outline"
                            }
                          >
                            {allOut ? "All sold out" : `${displayedStock} across ${variants.length}`}
                          </Badge>
                        ) : (
                          <Badge variant={product.stock <= 10 ? "destructive" : "secondary"}>
                            {product.stock}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() =>
                              void silentPrintBarcodeLabels(
                                [
                                  {
                                    name: product.name,
                                    title: product.title,
                                    price: product.price,
                                    barcode: product.barcode,
                                    size: null,
                                  },
                                ],
                                buildBarcodePrintUrl(
                                  product.name,
                                  product.title,
                                  product.price,
                                  product.barcode,
                                ),
                                1,
                              )
                            }
                            title={
                              hasVariants
                                ? "Print product barcode (open Edit for size labels)"
                                : "Print Barcode"
                            }
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => handleEditClick(product)}
                            title="Edit (incl. sizes)"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(product.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <Dialog
        open={isAddOpen || !!editingProduct}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Edit Product" : "Add New Product"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Slim Fit T-Shirt" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short Title / POS Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. T-Shirt Black" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (PKR)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="stock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Initial Stock</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Clothing, Shoes, Beverages" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Sizes — embedded directly in the dialog */}
              <SizesSection
                product={liveEditingProduct}
                pendingSizes={pendingSizes}
                setPendingSizes={setPendingSizes}
              />

              <div className="pt-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createProduct.isPending || updateProduct.isPending}
                >
                  {(createProduct.isPending || updateProduct.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingProduct ? "Save Changes" : "Create Product"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <InventoryCheckDialog
        open={inventoryCheckOpen}
        onOpenChange={setInventoryCheckOpen}
        products={products ?? []}
        categories={categories}
        search={checkSearch}
        setSearch={setCheckSearch}
        category={checkCategory}
        setCategory={setCheckCategory}
      />
    </div>
  );
}

interface InventoryCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  categories: string[];
  search: string;
  setSearch: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
}

function InventoryCheckDialog({
  open,
  onOpenChange,
  products,
  categories,
  search,
  setSearch,
  category,
  setCategory,
}: InventoryCheckDialogProps) {
  // Discover all sizes actually used across products, ordered by PRESET first
  const sizesInUse = new Set<string>();
  for (const p of products) {
    for (const v of p.variants ?? []) {
      if (v.size) sizesInUse.add(v.size);
    }
  }
  const orderedSizes: string[] = [];
  for (const s of PRESET_SIZES) {
    if (sizesInUse.has(s)) {
      orderedSizes.push(s);
      sizesInUse.delete(s);
    }
  }
  orderedSizes.push(...Array.from(sizesInUse).sort());

  // Apply filters
  const filtered = products.filter((p) => {
    if (category !== "all" && p.category !== category) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${p.name} ${p.title} ${p.barcode ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Stats
  let totalPieces = 0;
  let outOfStockSizes = 0;
  let inStockSizes = 0;
  for (const p of filtered) {
    if (p.variants && p.variants.length > 0) {
      for (const v of p.variants) {
        totalPieces += v.stock ?? 0;
        if ((v.stock ?? 0) > 0) inStockSizes++;
        else outOfStockSizes++;
      }
    } else {
      totalPieces += p.stock ?? 0;
    }
  }

  const productTotalStock = (p: Product) => {
    if (p.variants && p.variants.length > 0) {
      return p.variants.reduce((sum, v) => sum + (v.stock ?? 0), 0);
    }
    return p.stock ?? 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1200px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <ClipboardList className="h-6 w-6" />
            Inventory Check
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Saari inventory ek nazar mein — har product ke kon kon se size available
            hain aur kitne pieces hain.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 px-6 py-4 border-b border-border bg-secondary/30">
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">Total Products</div>
            <div className="text-2xl font-bold">{filtered.length}</div>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">Total Pieces</div>
            <div className="text-2xl font-bold">{totalPieces}</div>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">
              In-Stock / Out-of-Stock Sizes
            </div>
            <div className="text-2xl font-bold">
              <span className="text-emerald-500">{inStockSizes}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="text-destructive">{outOfStockSizes}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 py-3 border-b border-border">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products or barcode..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[200px] bg-background">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1 px-6">
          <Table>
            <TableHeader className="bg-secondary/50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="min-w-[220px]">Product</TableHead>
                <TableHead className="w-[120px]">Category</TableHead>
                {orderedSizes.length === 0 ? (
                  <TableHead className="text-center">Stock</TableHead>
                ) : (
                  <>
                    {orderedSizes.map((s) => (
                      <TableHead key={s} className="text-center w-[80px]">
                        {s}
                      </TableHead>
                    ))}
                    <TableHead className="text-center w-[100px]">Base</TableHead>
                  </>
                )}
                <TableHead className="text-center w-[90px] font-bold">
                  Total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={orderedSizes.length + 4}
                    className="text-center text-muted-foreground py-10"
                  >
                    Koi product nahi mila.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => {
                  const total = productTotalStock(p);
                  const hasVariants = (p.variants?.length ?? 0) > 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.title}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {p.category}
                        </Badge>
                      </TableCell>
                      {orderedSizes.length === 0 ? (
                        <TableCell className="text-center">
                          {(p.stock ?? 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold">
                              <Check className="h-4 w-4" />
                              {p.stock}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-destructive font-semibold">
                              <X className="h-4 w-4" />0
                            </span>
                          )}
                        </TableCell>
                      ) : (
                        <>
                          {orderedSizes.map((size) => {
                            const variant = p.variants?.find(
                              (v) => v.size === size,
                            );
                            if (!variant) {
                              return (
                                <TableCell
                                  key={size}
                                  className="text-center text-muted-foreground/40"
                                >
                                  —
                                </TableCell>
                              );
                            }
                            const stock = variant.stock ?? 0;
                            return (
                              <TableCell key={size} className="text-center">
                                {stock > 0 ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold">
                                    <Check className="h-4 w-4" />
                                    {stock}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-destructive font-semibold">
                                    <X className="h-4 w-4" />0
                                  </span>
                                )}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center text-muted-foreground">
                            {hasVariants ? (
                              "—"
                            ) : (p.stock ?? 0) > 0 ? (
                              <span className="text-emerald-500 font-semibold">
                                {p.stock}
                              </span>
                            ) : (
                              <span className="text-destructive font-semibold">
                                0
                              </span>
                            )}
                          </TableCell>
                        </>
                      )}
                      <TableCell className="text-center">
                        <Badge
                          variant={total > 0 ? "default" : "destructive"}
                          className="font-bold"
                        >
                          {total}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-secondary/30">
          <div className="text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 mr-3">
              <Check className="h-3 w-3 text-emerald-500" /> Available
            </span>
            <span className="inline-flex items-center gap-1 mr-3">
              <X className="h-3 w-3 text-destructive" /> Out of stock
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="text-muted-foreground/40">—</span> Size not added
            </span>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
