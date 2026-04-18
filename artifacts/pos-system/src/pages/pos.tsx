import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { 
  useGetCurrentUser, 
  useGetProductByBarcode, 
  useCreateSale,
  Product
} from "@workspace/api-client-react";
import { 
  Search, 
  ShoppingCart, 
  Minus, 
  Plus, 
  Trash2, 
  CreditCard,
  Barcode,
  Loader2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";

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
  const [completedSaleId, setCompletedSaleId] = useState<number | null>(null);
  
  const createSale = useCreateSale();

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
          cashierId: user.id
        }
      },
      {
        onSuccess: (sale) => {
          setCart([]);
          setCompletedSaleId(sale.id);
          toast({
            title: "Sale Completed",
            description: "Transaction processed successfully.",
          });
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

  return (
    <div className="flex h-full bg-background" onClick={() => scannerInputRef.current?.focus()}>
      
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
              onBlur={(e) => {
                // Prevent stealing focus if we clicked a button
                if (!e.relatedTarget?.closest('button')) {
                  e.target.focus();
                }
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

      {/* Invoice Print Dialog */}
      <Dialog open={!!completedSaleId} onOpenChange={(open) => !open && setCompletedSaleId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-bold text-primary">Sale Successful</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6 space-y-4 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-2">
              <CreditCard className="w-8 h-8" />
            </div>
            <p className="text-muted-foreground">
              Transaction #{completedSaleId} has been completed successfully.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row sm:space-x-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setCompletedSaleId(null)}>
              New Sale
            </Button>
            <Button 
              className="w-full sm:w-auto" 
              onClick={() => {
                window.open(`/invoice/${completedSaleId}`, '_blank');
                setCompletedSaleId(null);
                if (scannerInputRef.current) scannerInputRef.current.focus();
              }}
            >
              Print Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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