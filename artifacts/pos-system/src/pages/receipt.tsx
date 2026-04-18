import { useGetSale } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

function formatPKR(amount: number) {
  return "Rs. " + Number(amount).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Receipt() {
  const params = useParams();
  const saleId = parseInt(params.id as string, 10);
  const { data: sale, isLoading, error } = useGetSale(saleId, { query: { enabled: !!saleId } });
  const printedRef = useRef(false);

  useEffect(() => {
    if (sale && !printedRef.current) {
      printedRef.current = true;
      const t = setTimeout(() => {
        window.print();
      }, 250);
      const onAfterPrint = () => {
        setTimeout(() => window.close(), 200);
      };
      window.addEventListener("afterprint", onAfterPrint);
      return () => {
        clearTimeout(t);
        window.removeEventListener("afterprint", onAfterPrint);
      };
    }
  }, [sale]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-black" />
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white text-red-600">
        Error loading receipt.
      </div>
    );
  }

  return (
    <div className="receipt-root bg-white text-black">
      <style>{`
        @page { size: 80mm auto; margin: 0; }
        @media print {
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
        }
        .receipt-root {
          width: 80mm;
          padding: 4mm 4mm 6mm;
          margin: 0 auto;
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Courier New", monospace;
          font-size: 11px;
          line-height: 1.35;
          color: #000;
        }
        .center { text-align: center; }
        .right  { text-align: right; }
        .row    { display: flex; justify-content: space-between; gap: 6px; }
        .dashed { border-top: 1px dashed #000; margin: 4px 0; }
        .brand  { font-weight: 800; font-size: 18px; letter-spacing: .5px; }
        .small  { font-size: 10px; }
        .bold   { font-weight: 700; }
        .muted  { color: #444; }
        table.items { width: 100%; border-collapse: collapse; }
        table.items td { padding: 2px 0; vertical-align: top; }
        table.items td.qty { width: 18%; }
        table.items td.amt { width: 32%; text-align: right; }
        .total-row { font-size: 14px; font-weight: 800; }
      `}</style>

      <div className="center">
        <div className="brand">Brand Studio</div>
        <div className="small muted">Retail Excellence</div>
        <div className="small muted">123 Commerce St., Karachi</div>
        <div className="small muted">Tel: (021) 1234-567</div>
      </div>

      <div className="dashed" />

      <div className="row small">
        <span>Receipt #</span>
        <span className="bold">{sale.id.toString().padStart(6, "0")}</span>
      </div>
      <div className="row small">
        <span>Date</span>
        <span>{format(new Date(sale.createdAt), "dd MMM yyyy, hh:mm a")}</span>
      </div>
      <div className="row small">
        <span>Cashier</span>
        <span>{sale.cashierName || `User #${sale.cashierId}`}</span>
      </div>

      <div className="dashed" />

      <table className="items">
        <tbody>
          {sale.items.map((it, i) => (
            <tr key={i}>
              <td colSpan={3} style={{ paddingTop: 4 }}>
                <div className="bold" style={{ lineHeight: 1.2 }}>{it.productName}</div>
                <div className="small muted" style={{ fontFamily: "monospace" }}>{it.barcode}</div>
                <div className="row small" style={{ marginTop: 2 }}>
                  <span>{it.quantity} x {formatPKR(it.price)}</span>
                  <span className="bold">{formatPKR(it.subtotal)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="dashed" />

      <div className="row"><span>Subtotal</span><span>{formatPKR(sale.totalAmount)}</span></div>
      <div className="row"><span>Tax (0%)</span><span>{formatPKR(0)}</span></div>
      <div className="dashed" />
      <div className="row total-row"><span>TOTAL</span><span>{formatPKR(sale.totalAmount)}</span></div>

      <div className="dashed" />

      <div className="center small" style={{ marginTop: 6 }}>
        Thank you for shopping with us!
      </div>
      <div className="center small muted">
        Returns within 30 days with this receipt
      </div>
      <div className="center small muted" style={{ marginTop: 6 }}>
        * * * * *
      </div>

      <div className="no-print" style={{ position: "fixed", top: 8, left: 8, background: "#fffbe6", color: "#7a5c00", padding: "6px 10px", borderRadius: 6, fontFamily: "ui-sans-serif, system-ui", fontSize: 12 }}>
        80mm thermal receipt — auto‑prints, then closes.
      </div>
    </div>
  );
}
