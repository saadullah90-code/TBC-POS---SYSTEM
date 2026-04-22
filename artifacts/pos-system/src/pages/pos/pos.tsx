import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useGetCurrentUser,
  useGetProductByBarcode,
  useCreateSale,
  Product,
  ProductVariant,
} from "@workspace/api-client-react";
import {
  ShoppingCart,
  Minus,
  Plus,
  Trash2,
  CreditCard,
  Barcode,
  Loader2,
  User,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ReceiptPrintDialog } from "@/components/receipt/receipt-print-dialog";
import type { Sale } from "@workspace/api-client-react";
import { silentPrintPdf, getAssignedPrinter } from "@/lib/printer-bridge";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";

interface CartItem {
  // Stable cart line key — productId for plain products, productId-variantId for variants
  key: string;
  productId: number;
  productName: string;
  // The barcode/price/availableStock we are tracking for THIS line
  barcode: string;
  price: number;
  availableStock: number;
  cartQuantity: number;
  // Variant info (null for plain products)
  variantId: number | null;
  size: string | null;
}

function lineKey(productId: number, variantId: number | null) {
  return variantId == null ? `p-${productId}` : `p-${productId}-v-${variantId}`;
}

export default function Pos() {
  const { data: user } = useGetCurrentUser();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const scannerInputRef = useRef<HTMLInputElement>(null);

  const [barcodeInput, setBarcodeInput] = useState("");
  const [activeBarcode, setActiveBarcode] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [lastReceipt, setLastReceipt] = useState<{ id: number; total: number; sale: Sale } | null>(null);
  const [receiptDialog, setReceiptDialog] = useState<{ sale: Sale; auto: boolean } | null>(null);

  const createSale = useCreateSale();

  useBarcodeScanner((code) => {
    setBarcodeInput(code);
    setActiveBarcode(code);
  });

  useEffect(() => {
    localStorage.setItem("nexus_pos_cart", JSON.stringify(cart));
    window.dispatchEvent(new Event("storage"));
  }, [cart]);

  const { data: scannedProduct, error: scanError, isFetching: isScanning } = useGetProductByBarcode(
    activeBarcode || "",
    { query: { enabled: !!activeBarcode, retry: false } as any },
  );

  const resetScanner = useCallback(() => {
    setBarcodeInput("");
    setActiveBarcode(null);
    if (scannerInputRef.current) scannerInputRef.current.focus();
  }, []);

  const addToCart = useCallback(
    (product: Product, variant: ProductVariant | null) => {
      const isVariant = !!variant;
      const stock = isVariant ? variant!.stock : product.stock;
      const barcode = isVariant ? variant!.barcode : product.barcode;
      const productName = isVariant ? `${product.name} — Size ${variant!.size}` : product.name;
      const k = lineKey(product.id, variant?.id ?? null);

      // Hard guard against scanning a product that has variants but no variant matched.
      // Force the cashier to scan an actual size barcode.
      if (!isVariant && (product.variants?.length ?? 0) > 0) {
        toast({
          variant: "destructive",
          title: "This item has sizes",
          description: `Scan the size-specific barcode for "${product.name}" instead.`,
        });
        return;
      }

      setCart((prev) => {
        const existing = prev.find((item) => item.key === k);
        if (existing) {
          if (existing.cartQuantity >= stock) {
            toast({
              variant: "destructive",
              title: "Insufficient Stock",
              description: `Only ${stock} ${isVariant ? `of size ${variant!.size}` : "items"} available.`,
            });
            return prev;
          }
          return prev.map((item) =>
            item.key === k ? { ...item, cartQuantity: item.cartQuantity + 1 } : item,
          );
        }
        if (stock < 1) {
          toast({
            variant: "destructive",
            title: isVariant ? "Sold Out" : "Out of Stock",
            description: isVariant
              ? `${product.name} (Size ${variant!.size}) is sold out.`
              : `${product.name} is currently out of stock.`,
          });
          return prev;
        }
        return [
          ...prev,
          {
            key: k,
            productId: product.id,
            productName,
            barcode,
            price: product.price,
            availableStock: stock,
            cartQuantity: 1,
            variantId: variant?.id ?? null,
            size: variant?.size ?? null,
          },
        ];
      });
    },
    [toast],
  );

  // Handle scanned product result
  useEffect(() => {
    if (scannedProduct && activeBarcode) {
      const matched = (scannedProduct as any).matchedVariant as ProductVariant | null | undefined;
      addToCart(scannedProduct as Product, matched ?? null);
      resetScanner();
    }
  }, [scannedProduct, activeBarcode, resetScanner, addToCart]);

  useEffect(() => {
    if (scanError && activeBarcode) {
      toast({
        variant: "destructive",
        title: "Product Not Found",
        description: `No product or size found with barcode: ${activeBarcode}`,
      });
      resetScanner();
    }
  }, [scanError, activeBarcode, toast, resetScanner]);

  const handleBarcodeScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && barcodeInput.trim()) {
      e.preventDefault();
      setActiveBarcode(barcodeInput.trim());
    }
  };

  const updateQuantity = (key: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.key === key) {
          const newQty = item.cartQuantity + delta;
          if (newQty > item.availableStock) {
            toast({
              variant: "destructive",
              title: "Insufficient Stock",
              description: `Only ${item.availableStock} ${item.size ? `of size ${item.size}` : "items"} available.`,
            });
            return item;
          }
          return newQty > 0 ? { ...item, cartQuantity: newQty } : item;
        }
        return item;
      }),
    );
    if (scannerInputRef.current) scannerInputRef.current.focus();
  };

  const removeFromCart = (key: string) => {
    setCart((prev) => prev.filter((item) => item.key !== key));
    if (scannerInputRef.current) scannerInputRef.current.focus();
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.cartQuantity, 0);

  const handleCompleteSale = () => {
    if (cart.length === 0 || !user) return;

    createSale.mutate(
      {
        data: {
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.cartQuantity,
            variantId: item.variantId,
          })),
          cashierId: user.id,
          customerName: customerName.trim() || null,
        },
      },
      {
        onSuccess: (sale) => {
          const total = sale.totalAmount;
          setCart([]);
          setLastReceipt({ id: sale.id, total, sale });
          setReceiptDialog({ sale, auto: true });
          toast({
            title: `Sale #${sale.id} completed`,
            description: `Total ${formatCurrency(total)} — printing receipt…`,
          });
          setCustomerName("");
          setTimeout(() => scannerInputRef.current?.focus(), 100);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Sale Failed",
            description: err?.error || "Failed to process transaction.",
          });
        },
      },
    );
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "PKR" }).format(amount);

  const refocusScanner = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, button, [role="button"], a, select, [contenteditable="true"]')) {
      return;
    }
    scannerInputRef.current?.focus();
  };

  return (
    <div className="flex h-full bg-background" onClick={refocusScanner}>
      <div className="flex-1 flex flex-col p-6 space-y-6">
        <div className="flex items-center space-x-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Barcode className="h-5 w-5 text-muted-foreground" />
            </div>
            <Input
              ref={scannerInputRef}
              type="text"
              autoFocus
              data-scanner="true"
              onBlur={(e) => {
                const next = e.relatedTarget as HTMLElement | null;
                if (next && next.closest('input, textarea, button, [role="button"], a, select, [contenteditable="true"]')) {
                  return;
                }
                e.target.focus();
              }}
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeScan}
              placeholder="Scan barcode (product or size) or type and press Enter..."
              className="pl-10 h-14 text-lg bg-card border-2 border-primary/20 focus-visible:border-primary shadow-sm font-mono"
            />
            {isScanning && (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 rounded-xl border border-border bg-card/50 flex flex-col items-center justify-center text-muted-foreground">
          <Barcode className="w-24 h-24 mb-4 opacity-20" />
          <h3 className="text-xl font-medium text-foreground">Scanner Ready</h3>
          <p>Scan an item to add it to the cart.</p>
          <p className="text-xs mt-1 opacity-70">Clothing & shoes: scan the size-specific label.</p>
        </div>
      </div>

      <div className="w-[450px] bg-card border-l border-border flex flex-col shadow-xl z-10 relative">
        <div className="h-16 flex items-center px-6 border-b border-border bg-card">
          <ShoppingCart className="h-5 w-5 mr-2 text-primary" />
          <h2 className="text-xl font-bold tracking-tight">Current Sale</h2>
          <Badge className="ml-auto bg-primary text-primary-foreground">{cart.length} items</Badge>
        </div>

        <div className="px-4 pt-4">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
            <User className="h-3.5 w-3.5" /> Customer Name
            <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">(optional)</span>
          </label>
          <Input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Walk-in customer"
            className="h-10 bg-background"
          />
        </div>

        <ScrollArea className="flex-1 p-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground mt-20 space-y-4">
              <ShoppingCart className="w-12 h-12 opacity-20" />
              <p>Cart is empty</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => (
                <div key={item.key} className="flex gap-4 bg-background p-4 rounded-lg border border-border group hover:border-primary/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-foreground truncate" title={item.productName}>
                      {item.productName}
                    </h4>
                    <p className="text-sm font-mono text-muted-foreground truncate">{item.barcode}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="font-bold text-primary">{formatCurrency(item.price)}</div>
                      {item.size && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 border border-primary/40 text-primary rounded">
                          SIZE {item.size}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive self-end"
                      onClick={(e) => { e.stopPropagation(); removeFromCart(item.key); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center bg-secondary rounded-md p-1 border border-border">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); updateQuantity(item.key, -1); }}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-medium text-sm">{item.cartQuantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); updateQuantity(item.key, 1); }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-6 bg-card border-t border-border mt-auto">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(cartTotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax (0%)</span>
              <span>{formatCurrency(0)}</span>
            </div>
            <Separator className="bg-border" />
            <div className="flex justify-between items-center">
              <span className="text-xl font-bold text-foreground">Total</span>
              <span className="text-3xl font-black text-primary">{formatCurrency(cartTotal)}</span>
            </div>
          </div>

          <Button
            className="w-full h-16 text-lg font-bold"
            size="lg"
            onClick={handleCompleteSale}
            disabled={cart.length === 0 || createSale.isPending}
          >
            {createSale.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
            ) : (
              <CreditCard className="h-6 w-6 mr-2" />
            )}
            Complete Sale
          </Button>
        </div>
      </div>

      {lastReceipt && (
        <div
          className="no-print fixed bottom-6 left-1/2 -translate-x-1/2 z-50 glossy rounded-full px-5 py-2.5 flex items-center gap-3 text-sm shadow-lg animate-in fade-in slide-in-from-bottom-2"
          onAnimationEnd={() => setTimeout(() => setLastReceipt(null), 4000)}
        >
          <div className="w-7 h-7 rounded-full glossy-brand flex items-center justify-center">
            <CreditCard className="w-4 h-4" />
          </div>
          <span className="text-white">
            Sale #{lastReceipt.id} • {formatCurrency(lastReceipt.total)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-white/70 hover:text-white"
            onClick={() => {
              // Always re-open the in-memory dialog with the full Sale object —
              // never go through an iframe + API roundtrip (that path was
              // printing blank pages when the print fired before the embedded
              // page had finished fetching its data).
              setReceiptDialog({ sale: lastReceipt.sale, auto: false });
            }}
          >
            Reprint
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-white/70 hover:text-white"
            onClick={async () => {
              const sale = lastReceipt.sale;
              try {
                const pdf = renderInvoicePdf(sale);
                const result = await silentPrintPdf("receipt", pdf, {
                  jobName: `invoice_${sale.id}`,
                  sizeMm: { width: 72, height: 297 },
                });
                if (result.ok) {
                  toast({
                    title: "Invoice sent to printer",
                    description: `Printed silently to ${getAssignedPrinter("receipt")}.`,
                  });
                  return;
                }
                // No printer / QZ unavailable → open the PDF in a new tab so
                // the cashier can still print from the browser's PDF viewer.
                const blob = new Blob([pdf as BlobPart], { type: "application/pdf" });
                const url = URL.createObjectURL(blob);
                const w = window.open(url, "_blank");
                if (!w) {
                  toast({
                    variant: "destructive",
                    title: "Pop-up blocked",
                    description: "Allow pop-ups to view the invoice PDF.",
                  });
                }
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
              } catch (err: any) {
                toast({
                  variant: "destructive",
                  title: "Could not generate invoice",
                  description: err?.message || "Unknown error",
                });
              }
            }}
          >
            Invoice
          </Button>
        </div>
      )}

      <ReceiptPrintDialog
        sale={receiptDialog?.sale ?? null}
        open={!!receiptDialog}
        autoPrint={receiptDialog?.auto ?? false}
        onClose={() => setReceiptDialog(null)}
      />
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}>
      {children}
    </span>
  );
}
