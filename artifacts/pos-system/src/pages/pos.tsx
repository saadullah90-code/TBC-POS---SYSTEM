import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useGetCurrentUser,
  useGetProductByBarcode,
  useCreateSale,
  Product,
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
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";

interface CartItem extends Product {
  cartQuantity: number;
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
  const [lastReceipt, setLastReceipt] = useState<{ id: number; total: number } | null>(null);

  const createSale = useCreateSale();

  // Global hardware-scanner listener (works even if focus drifts away)
  useBarcodeScanner((code) => {
    setBarcodeInput(code);
    setActiveBarcode(code);
  });

  // Sync cart to localStorage for customer display
  useEffect(() => {
    localStorage.setItem("nexus_pos_cart", JSON.stringify(cart));
    // Trigger storage event for same-window tabs (some browsers need this if we want to poll less)
    window.dispatchEvent(new Event("storage"));
  }, [cart]);

  const { data: scannedProduct, error: scanError, isFetching: isScanning } = useGetProductByBarcode(
    activeBarcode || "",
    { query: { enabled: !!activeBarcode, retry: false } }
  );

  const resetScanner = useCallback(() => {
    setBarcodeInput("");
    setActiveBarcode(null);
    if (scannerInputRef.current) {
      scannerInputRef.current.focus();
    }
  }, []);

  // Handle scanned product result
  useEffect(() => {
    if (scannedProduct && activeBarcode) {
      addToCart(scannedProduct);
      resetScanner();
    }
  }, [scannedProduct, activeBarcode, resetScanner]);

  // Handle scan error
  useEffect(() => {
    if (scanError && activeBarcode) {
      toast({
        variant: "destructive",
        title: "Product Not Found",
        description: `No product found with barcode: ${activeBarcode}`,
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

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.cartQuantity >= product.stock) {
          toast({
            variant: "destructive",
            title: "Insufficient Stock",
            description: `Only ${product.stock} items available.`,
          });
          return prev;
        }
        return prev.map((item) =>
          item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + 1 } : item
        );
      }
      if (product.stock < 1) {
        toast({
          variant: "destructive",
          title: "Out of Stock",
          description: `${product.name} is currently out of stock.`,
        });
        return prev;
      }
      return [...prev, { ...product, cartQuantity: 1 }];
    });
  };

  const updateQuantity = (id: number, delta: number) => {
    setCart((prev) => {
      return prev.map((item) => {
        if (item.id === id) {
          const newQty = item.cartQuantity + delta;
          if (newQty > item.stock) {
            toast({
              variant: "destructive",
              title: "Insufficient Stock",
              description: `Only ${item.stock} items available.`,
            });
            return item;
          }
          return newQty > 0 ? { ...item, cartQuantity: newQty } : item;
        }
        return item;
      });
    });
    if (scannerInputRef.current) scannerInputRef.current.focus();
  };

  const removeFromCart = (id: number) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
    if (scannerInputRef.current) scannerInputRef.current.focus();
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.cartQuantity, 0);

  const handleCompleteSale = () => {
    if (cart.length === 0 || !user) return;

    createSale.mutate(
      {
        data: {
          items: cart.map(item => ({ productId: item.id, quantity: item.cartQuantity })),
          cashierId: user.id,
          customerName: customerName.trim() || null,
        }
      },
      {
        onSuccess: (sale) => {
          const total = sale.totalAmount;
          setCart([]);
          setLastReceipt({ id: sale.id, total });
          // Auto-open receipt window — it will print itself and close.
          const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
          const w = window.open(
            `${base}/receipt/${sale.id}`,
            "branx_receipt",
            "width=420,height=720",
          );
          if (!w) {
            toast({
              variant: "destructive",
              title: "Pop-up blocked",
              description: "Allow pop-ups to auto-print receipts.",
            });
          }
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
        }
      }
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "PKR",
    }).format(amount);
  };

  const refocusScanner = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Don't steal focus from any interactive element the user clicked.
    if (target.closest('input, textarea, button, [role="button"], a, select, [contenteditable="true"]')) {
      return;
    }
    scannerInputRef.current?.focus();
  };

  return (
    <div className="flex h-full bg-background" onClick={refocusScanner}>
      
      {/* Scanner & Manual Entry Area */}
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
                // Allow focus to move to any other interactive element.
                if (next && next.closest('input, textarea, button, [role="button"], a, select, [contenteditable="true"]')) {
                  return;
                }
                e.target.focus();
              }}
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeScan}
              placeholder="Scan barcode or type and press Enter..."
              className="pl-10 h-14 text-lg bg-card border-2 border-primary/20 focus-visible:border-primary shadow-sm font-mono"
            />
            {isScanning && (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          </div>
        </div>

        {/* Display Area for Large Screens (Optional manual catalog could go here) */}
        <div className="flex-1 rounded-xl border border-border bg-card/50 flex flex-col items-center justify-center text-muted-foreground">
          <Barcode className="w-24 h-24 mb-4 opacity-20" />
          <h3 className="text-xl font-medium text-foreground">Scanner Ready</h3>
          <p>Scan an item to add it to the cart.</p>
        </div>
      </div>

      {/* Cart Area */}
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
                <div key={item.id} className="flex gap-4 bg-background p-4 rounded-lg border border-border group hover:border-primary/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-foreground truncate" title={item.name}>{item.name}</h4>
                    <p className="text-sm font-mono text-muted-foreground truncate">{item.barcode}</p>
                    <div className="font-bold text-primary mt-1">{formatCurrency(item.price)}</div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive self-end"
                      onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center bg-secondary rounded-md p-1 border border-border">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6" 
                        onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, -1); }}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-medium text-sm">{item.cartQuantity}</span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, 1); }}
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

      {/* Subtle "last receipt" pill — non-blocking, auto-fades */}
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
              const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
              window.open(`${base}/receipt/${lastReceipt.id}`, "_blank", "width=420,height=720");
            }}
          >
            Reprint
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-white/70 hover:text-white"
            onClick={() => {
              const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
              window.open(`${base}/invoice/${lastReceipt.id}`, "_blank");
            }}
          >
            A4 Invoice
          </Button>
        </div>
      )}
    </div>
  );
}

// Simple Badge component fallback since it might not be exported from UI
function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}>
      {children}
    </span>
  );
}