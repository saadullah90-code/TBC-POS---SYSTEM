import { format } from "date-fns";
import type { Sale } from "@workspace/api-client-react";

function formatPKR(amount: number) {
  return "Rs. " + Number(amount).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Pure presentational 80mm thermal receipt slip.
 * Wrapped in `.receipt-slip` so global print CSS can isolate it for printing.
 */
export function ReceiptSlip({ sale }: { sale: Sale }) {
  return (
    <div className="receipt-slip">
      <style>{`
        .receipt-slip {
          width: 80mm;
          padding: 4mm 12mm 6mm 4mm;
          margin: 0 auto;
          background: #fff;
          color: #000;
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Courier New", monospace;
          font-size: 11px;
          line-height: 1.35;
        }
        .receipt-slip .center { text-align: center; }
        .receipt-slip .row    { display: flex; justify-content: space-between; gap: 6px; }
        .receipt-slip .dashed { border-top: 1px dashed #000; margin: 4px 0; }
        .receipt-slip .brand  { font-weight: 800; font-size: 18px; letter-spacing: .5px; }
        .receipt-slip .small  { font-size: 10px; }
        .receipt-slip .bold   { font-weight: 700; }
        .receipt-slip .muted  { color: #444; }
        .receipt-slip table.items { width: 100%; border-collapse: collapse; }
        .receipt-slip table.items td { padding: 2px 0; vertical-align: top; }
        .receipt-slip .total-row { font-size: 14px; font-weight: 800; }
      `}</style>

      <div className="center">
        <div className="brand">THE BRAND GALLERY</div>
        <div className="small muted">The Ultimate in Luxury</div>
        <div className="small muted">Plaza 172, Sector H, Phase 1, Dha, Lahore.</div>
        <div className="small muted">Contact us: 03004707675</div>
      </div>

      <div className="dashed" />

      <div className="row small"><span>Receipt #</span><span className="bold">{sale.id.toString().padStart(6, "0")}</span></div>
      <div className="row small"><span>Date</span><span>{format(new Date(sale.createdAt), "dd MMM yyyy, hh:mm a")}</span></div>
      <div className="row small"><span>Cashier</span><span>{sale.cashierName || `User #${sale.cashierId}`}</span></div>
      <div className="row small"><span>Customer</span><span className="bold">{sale.customerName || "Walk-in"}</span></div>

      <div className="dashed" />

      <table className="items">
        <tbody>
          {sale.items.map((it, i) => (
            <tr key={i}>
              <td colSpan={3} style={{ paddingTop: 4 }}>
                <div className="bold" style={{ lineHeight: 1.2 }}>
                  {it.productName}
                  {it.size ? <span style={{ marginLeft: 6, padding: "0 4px", border: "1px solid #000", borderRadius: 2, fontSize: 10 }}>SIZE {it.size}</span> : null}
                </div>
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
      <div className="dashed" />
      <div className="row total-row"><span>TOTAL</span><span>{formatPKR(sale.totalAmount)}</span></div>

      <div className="dashed" />

      <div className="center small" style={{ marginTop: 6 }}>Thank you for shopping with us !</div>
      <div className="center small muted">Return or Exchange within 7 days with this reciept</div>
      <div className="center small muted" style={{ marginTop: 6 }}>* * * * *</div>
    </div>
  );
}
