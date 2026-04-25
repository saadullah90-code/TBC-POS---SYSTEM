import { format } from "date-fns";
import { X, User, Calendar, Hash, ShoppingBag } from "lucide-react";
import type { Sale } from "@workspace/api-client-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect } from "react";

interface Props {
  sale: Sale | null;
  open: boolean;
  onClose: () => void;
}

function formatPKR(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "PKR" }).format(amount);
}

/**
 * Read-only dialog showing the full details of a past sale.
 * No print actions — view only.
 */
export function SaleDetailsDialog({ sale, open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !sale) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(94vw, 560px)", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="glossy-brand px-5 py-4 flex items-center justify-between">
          <div className="text-white">
            <div className="text-xs uppercase tracking-wider opacity-80">Sale Details</div>
            <div className="font-bold text-lg leading-tight">
              Receipt #{sale.id.toString().padStart(6, "0")}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b border-border bg-secondary/30 text-sm">
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground">Date & Time</div>
              <div className="font-medium text-foreground">
                {format(new Date(sale.createdAt), "MMM d, yyyy")}
              </div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(sale.createdAt), "h:mm a")}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <User className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground">Cashier</div>
              <div className="font-medium text-foreground">
                {sale.cashierName || `User #${sale.cashierId}`}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <User className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground">Customer</div>
              <div className="font-medium text-foreground">
                {sale.customerName || "Walk-in"}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Hash className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground">Items</div>
              <div className="font-medium text-foreground">
                {sale.items.length} item{sale.items.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </div>

        {/* Items */}
        <ScrollArea className="flex-1 px-5 py-3" style={{ maxHeight: "40vh" }}>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
            <ShoppingBag className="w-3.5 h-3.5" /> Line Items
          </div>
          <div className="divide-y divide-border">
            {sale.items.map((it, i) => (
              <div key={i} className="py-2.5 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground truncate" title={it.productName}>
                    {it.productName}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {it.barcode}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {it.quantity} × {formatPKR(it.price)}
                  </div>
                </div>
                <div className="font-bold text-foreground tabular-nums shrink-0">
                  {formatPKR(it.subtotal)}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Totals */}
        <div className="px-5 py-4 border-t border-border bg-secondary/30 space-y-1.5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span><span>{formatPKR(sale.totalAmount)}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-border">
            <span className="text-base font-semibold text-foreground">Total</span>
            <span className="text-2xl font-black text-primary">{formatPKR(sale.totalAmount)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-card p-3">
          <button
            onClick={onClose}
            className="w-full h-11 rounded-md border border-border bg-secondary/50 text-foreground font-medium hover:bg-secondary transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
