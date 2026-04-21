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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { printDocument } from "@/lib/print";
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

function VariantManager({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
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

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });

  const handleAdd = () => {
    const size = (newSize === "__custom__" ? customSize : newSize).trim().toUpperCase();
    if (!size) {
      toast({ variant: "destructive", title: "Pick or type a size first" });
      return;
    }
    if ((product.variants ?? []).some((v) => v.size.toUpperCase() === size)) {
      toast({ variant: "destructive", title: `Size ${size} already exists` });
      return;
    }
    createVariant.mutate(
      { id: product.id, data: { size, stock: Math.max(0, Math.floor(newStock || 0)) } },
      {
        onSuccess: () => {
          refresh();
          setNewSize("");
          setCustomSize("");
          setNewStock(0);
          toast({ title: `Size ${size} added`, description: "Unique barcode generated." });
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Could not add size", description: err?.error || "Unknown error" });
        },
      },
    );
  };

  const handleSaveStock = (variant: ProductVariant) => {
    updateVariant.mutate(
      { id: product.id, variantId: variant.id, data: { stock: Math.max(0, Math.floor(editStock || 0)) } },
      {
        onSuccess: () => {
          refresh();
          setEditingId(null);
          toast({ title: "Stock updated" });
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Could not update stock", description: err?.error || "Unknown error" });
        },
      },
    );
  };

  const handleDelete = (variant: ProductVariant) => {
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

  const variants = product.variants ?? [];
  const usedSizes = new Set(variants.map((v) => v.size.toUpperCase()));
  const availablePresets = PRESET_SIZES.filter((s) => !usedSizes.has(s));

  const handlePrintAll = () => {
    if (variants.length === 0) {
      toast({ variant: "destructive", title: "No sizes to print yet" });
      return;
    }
    const variantIds = variants.map((v) => v.id).join(",");
    printDocument(`/inventory/barcode-print-bulk?variantIds=${variantIds}&copies=1`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="h-5 w-5 text-primary" />
            Sizes — {product.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2">Add a size</div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[120px]">
                <label className="text-xs text-muted-foreground">Size</label>
                <Select value={newSize} onValueChange={setNewSize}>
                  <SelectTrigger className="h-9 bg-background">
                    <SelectValue placeholder="Pick…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePresets.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                    <SelectItem value="__custom__">Custom…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newSize === "__custom__" && (
                <div className="min-w-[120px]">
                  <label className="text-xs text-muted-foreground">Custom size</label>
                  <Input
                    placeholder="e.g. 42 or EU38"
                    value={customSize}
                    onChange={(e) => setCustomSize(e.target.value)}
                    className="h-9"
                  />
                </div>
              )}
              <div className="w-[110px]">
                <label className="text-xs text-muted-foreground">Stock</label>
                <Input
                  type="number"
                  min={0}
                  value={newStock}
                  onChange={(e) => setNewStock(parseInt(e.target.value || "0", 10) || 0)}
                  className="h-9"
                />
              </div>
              <Button onClick={handleAdd} disabled={createVariant.isPending} className="h-9">
                {createVariant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Add
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Each size gets its own unique barcode. When that size sells, only its stock decreases.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {variants.length} size{variants.length === 1 ? "" : "s"}
            </div>
            <Button variant="outline" size="sm" onClick={handlePrintAll} disabled={variants.length === 0}>
              <PrinterIcon className="h-4 w-4 mr-1" /> Print all size labels
            </Button>
          </div>

          <ScrollArea className="max-h-[320px] rounded-lg border border-border">
            {variants.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No sizes yet. Add S, M, L, XL… above to start tracking inventory per size.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Size</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="w-[150px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variants.map((v) => {
                    const isEditing = editingId === v.id;
                    const isOut = v.stock <= 0;
                    return (
                      <TableRow key={v.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">{v.size}</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="px-2 py-1 bg-secondary rounded text-xs font-mono">{v.barcode}</code>
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Input
                              type="number"
                              min={0}
                              value={editStock}
                              onChange={(e) => setEditStock(parseInt(e.target.value || "0", 10) || 0)}
                              className="h-8 w-20 ml-auto"
                            />
                          ) : (
                            <Badge variant={isOut ? "destructive" : v.stock <= 5 ? "secondary" : "outline"}>
                              {isOut ? "Sold out" : v.stock}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {isEditing ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-primary"
                                  onClick={() => handleSaveStock(v)}
                                  disabled={updateVariant.isPending}
                                  title="Save"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setEditingId(null)}
                                  title="Cancel"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() =>
                                    printDocument(buildBarcodePrintUrl(product.name, product.title, product.price, v.barcode, v.size))
                                  }
                                  title="Print barcode"
                                >
                                  <Printer className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() => {
                                    setEditingId(v.id);
                                    setEditStock(v.stock);
                                  }}
                                  title="Edit stock"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDelete(v)}
                                  title="Delete size"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Inventory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [variantsForProductId, setVariantsForProductId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [copiesPerLabel, setCopiesPerLabel] = useState<number>(1);
  const [, setLocation] = useLocation();

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useListProducts({
    search: searchTerm || undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
  });

  const categories = Array.from(new Set(products?.map((p) => p.category) || [])).filter(Boolean);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

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

  const handleEditClick = (product: Product) => setEditingProduct(product);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    form.reset({ name: "", title: "", price: 0, category: "", stock: 0 });
    setIsAddOpen(true);
  };

  const onSubmit = (values: z.infer<typeof productSchema>) => {
    if (editingProduct) {
      updateProduct.mutate(
        { id: editingProduct.id, data: values },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
            setEditingProduct(null);
            toast({ title: "Product updated successfully" });
          },
          onError: (err: any) => {
            toast({ variant: "destructive", title: "Error updating product", description: err?.error || "Unknown error" });
          },
        },
      );
    } else {
      createProduct.mutate(
        { data: values },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
            setIsAddOpen(false);
            form.reset();
            toast({ title: "Product added successfully" });
          },
          onError: (err: any) => {
            toast({ variant: "destructive", title: "Error adding product", description: err?.error || "Unknown error" });
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
    printDocument(`/inventory/barcode-print-bulk?ids=${ids}&copies=${copiesPerLabel}`);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this product? All its sizes will be removed too.")) {
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

  const variantProduct = products?.find((p) => p.id === variantsForProductId) ?? null;

  return (
    <div className="flex flex-col h-full bg-background p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground mt-1">Manage products, sizes, stock levels, and barcodes.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLocation("/inventory/bulk-add")} className="font-semibold">
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
            <span className="text-muted-foreground">product{selectedIds.size === 1 ? "" : "s"} selected</span>
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setSelectedIds(new Set())}>
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
                onChange={(e) => setCopiesPerLabel(Math.max(1, parseInt(e.target.value || "1", 10) || 1))}
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
                    checked={!!products && products.length > 0 && products.every((p) => selectedIds.has(p.id))}
                    onCheckedChange={(c) => toggleSelectAll(!!c)}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="w-[200px] text-right">Actions</TableHead>
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
                      className={`hover:bg-secondary/20 transition-colors ${selectedIds.has(product.id) ? "bg-primary/5" : ""}`}
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
                              <span className="text-[10px] text-muted-foreground">+{variants.length - 6}</span>
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
                        <Badge variant="outline" className="bg-background/50">{product.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(product.price)}</TableCell>
                      <TableCell className="text-right">
                        {hasVariants ? (
                          <Badge variant={allOut ? "destructive" : displayedStock <= 5 ? "secondary" : "outline"}>
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
                            onClick={() => setVariantsForProductId(product.id)}
                            title="Manage sizes"
                          >
                            <Ruler className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() =>
                              printDocument(buildBarcodePrintUrl(product.name, product.title, product.price, product.barcode))
                            }
                            title={hasVariants ? "Print product barcode (use Sizes for size labels)" : "Print Barcode"}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => handleEditClick(product)}
                            title="Edit"
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
          if (!open) {
            setIsAddOpen(false);
            setEditingProduct(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
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
              {!editingProduct && (
                <p className="text-xs text-muted-foreground py-2 bg-secondary/50 px-3 rounded mt-2">
                  A unique barcode will be generated automatically. After creating, click the ruler icon to add sizes (S/M/L/XL…) — each size gets its own barcode and stock.
                </p>
              )}
              <div className="pt-4 flex justify-end">
                <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending}>
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

      {variantProduct && (
        <VariantManager product={variantProduct} onClose={() => setVariantsForProductId(null)} />
      )}
    </div>
  );
}
