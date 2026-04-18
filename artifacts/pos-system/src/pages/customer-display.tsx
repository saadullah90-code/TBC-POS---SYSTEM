import { useState, useEffect } from "react";
import { ShoppingCart } from "lucide-react";
import { Product } from "@workspace/api-client-react";

interface CartItem extends Product {
  cartQuantity: number;
}

export default function CustomerDisplay() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [time, setTime] = useState(new Date());

  // Poll localStorage for cart updates
  useEffect(() => {
    const updateCart = () => {
      try {
        const stored = localStorage.getItem("nexus_pos_cart");
        if (stored) {
          setCart(JSON.parse(stored));
        } else {
          setCart([]);
        }
      } catch (e) {
        console.error("Failed to parse cart from storage", e);
      }
    };

    updateCart();
    
    // Listen for storage events (works across tabs in same browser)
    window.addEventListener("storage", updateCart);
    
    // Also poll every 1s just in case storage events are unreliable
    const intervalId = setInterval(updateCart, 1000);
    const timeIntervalId = setInterval(() => setTime(new Date()), 1000);

    return () => {
      window.removeEventListener("storage", updateCart);
      clearInterval(intervalId);
      clearInterval(timeIntervalId);
    };
  }, []);

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.cartQuantity, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "PKR",
    }).format(amount);
  };

  return (
    <div className="h-screen w-full bg-background flex text-foreground">
      {/* Left side - Welcome / Ad space */}
      <div className="flex-1 bg-card flex flex-col justify-between p-12 border-r border-border">
        <div>
          <h1 className="text-6xl font-black text-primary tracking-tighter mb-4">NEXUS</h1>
          <p className="text-3xl font-light text-muted-foreground">Welcome to our store.</p>
        </div>
        
        <div className="space-y-8">
          <div className="aspect-video w-full max-w-2xl bg-secondary/50 rounded-2xl flex items-center justify-center overflow-hidden border border-border">
            <div className="text-center p-8 space-y-4">
              <div className="text-5xl font-bold text-primary">MEMBER REWARDS</div>
              <p className="text-2xl text-muted-foreground">Ask cashier to scan your app to earn points.</p>
            </div>
          </div>
        </div>

        <div className="text-2xl font-mono text-muted-foreground">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Right side - Cart Summary */}
      <div className="w-[600px] flex flex-col bg-background shadow-2xl relative z-10">
        <div className="h-24 flex items-center px-8 bg-card border-b border-border">
          <ShoppingCart className="w-8 h-8 mr-4 text-primary" />
          <h2 className="text-3xl font-bold">Your Order</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 space-y-6">
              <ShoppingCart className="w-32 h-32" />
              <p className="text-3xl">Waiting for items...</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex justify-between items-start pb-6 border-b border-border">
                <div className="pr-4 flex-1">
                  <h3 className="text-2xl font-semibold mb-1 truncate">{item.name}</h3>
                  <p className="text-xl text-muted-foreground font-mono">
                    {item.cartQuantity} × {formatCurrency(item.price)}
                  </p>
                </div>
                <div className="text-3xl font-bold text-foreground">
                  {formatCurrency(item.price * item.cartQuantity)}
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-8 bg-card border-t-2 border-border shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)]">
            <div className="flex justify-between items-center mb-4 text-2xl text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(cartTotal)}</span>
            </div>
            <div className="flex justify-between items-center mb-8 text-2xl text-muted-foreground">
              <span>Tax</span>
              <span>{formatCurrency(0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-4xl font-bold text-foreground">Total</span>
              <span className="text-6xl font-black text-primary">{formatCurrency(cartTotal)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
