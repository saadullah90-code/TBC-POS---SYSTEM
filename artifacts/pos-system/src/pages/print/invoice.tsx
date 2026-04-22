import { useGetSale } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { format } from "date-fns";
import { Loader2, Printer, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { isEmbedded, signalPrintReady } from "@/lib/print";
import {
  silentPrintPdf,
  getAssignedPrinter,
  isBrowserDialogForced,
} from "@/lib/printer-bridge";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { useToast } from "@/hooks/use-toast";

/**
 * Customer invoice — prints on the SAME 80mm thermal roll as the receipt
 * (formerly an A4 page). The previous A4 layout was ejecting the whole roll
 * on thermal printers; everything we print is now sized to the receipt printer.
 *
 * Print path:
 *   1. Try silent print via QZ Tray to the receipt printer.
 *   2. If QZ isn't available or no receipt printer is assigned, fall back
 *      to `window.print()` against this on-screen 80mm preview.
 */
export default function Invoice() {
  const params = useParams();
  const { toast } = useToast();
  const saleId = parseInt(params.id as string, 10);
  const { data: sale, isLoading, error } = useGetSale(saleId, { query: { enabled: !!saleId } as any });

  const [printing, setPrinting] = useState(false);
  const [silentSent, setSilentSent] = useState(false);
  const printedRef = useRef(false);

  const handlePrint = async () => {
    if (!sale) return;
    setPrinting(true);
    try {
      const pdf = renderInvoicePdf(sale);
      const result = await silentPrintPdf("receipt", pdf, {
        jobName: `invoice_${sale.id}`,
        // No sizeMm — let the printer driver use its configured paper size
        // (typically 80mm). The PDF is already exactly 80mm wide so no
        // scaling occurs and the right edge isn't clipped.
      });
      if (result.ok) {
        setSilentSent(true);
        toast({
          title: "Invoice sent to printer",
          description: `Printed silently to ${getAssignedPrinter("receipt")}.`,
        });
      } else if (
        result.reason === "no-printer-assigned" ||
        result.reason === "browser-dialog-forced" ||
        /QZ|websocket|Could not reach/i.test(result.reason || "")
      ) {
        // Fall back to the browser print dialog so the cashier still gets
        // something on paper — the on-screen preview is already 80mm wide.
        window.print();
      } else {
        toast({
          variant: "destructive",
          title: "Silent print failed",
          description: result.reason || "Falling back to browser dialog.",
        });
        window.print();
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Print failed",
        description: err?.message || "Falling back to browser dialog.",
      });
      window.print();
    } finally {
      setPrinting(false);
    }
  };

  // Auto-print once the sale loads, mirroring the cashier-receipt flow so the
  // cashier doesn't have to hunt for a button after closing a sale.
  useEffect(() => {
    if (!sale || printedRef.current) return;
    printedRef.current = true;
    if (isEmbedded()) {
      signalPrintReady();
      return;
    }
    const t = setTimeout(() => void handlePrint(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale]);

  // Auto-close when launched in its own tab once the print dialog is dismissed.
  useEffect(() => {
    if (isEmbedded()) return;
    const onAfter = () => setTimeout(() => window.close(), 200);
    window.addEventListener("afterprint", onAfter);
    return () => window.removeEventListener("afterprint", onAfter);
  }, []);

  const formatPKR = (amount: number) =>
    "Rs. " +
    Number(amount).toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

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
        Error loading invoice.
      </div>
    );
  }

  const hasReceiptPrinter =
    !!getAssignedPrinter("receipt") && !isBrowserDialogForced();

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
        .row    { display: flex; justify-content: space-between; gap: 6px; }
        .dashed { border-top: 1px dashed #000; margin: 4px 0; }
        .brand  { font-weight: 800; font-size: 18px; letter-spacing: .5px; }
        .doctype { font-weight: 800; font-size: 13px; letter-spacing: 1.5px; margin-top: 2px; }
        .small  { font-size: 10px; }
        .bold   { font-weight: 700; }
        .muted  { color: #444; }
        table.items { width: 100%; border-collapse: collapse; }
        table.items td { padding: 2px 0; vertical-align: top; }
        .total-row { font-size: 14px; font-weight: 800; }
      `}</style>

      <div className="center">
        <div className="brand">De Luxury Boutique</div>
        <div className="small muted">Retail Excellence</div>
        <div className="small muted">123 Commerce St., Karachi</div>
        <div className="small muted">Tel: (021) 1234-567</div>
        <div className="doctype">CUSTOMER INVOICE</div>
      </div>

      <div className="dashed" />

      <div className="row small">
        <span>Invoice #</span>
        <span className="bold">{sale.id.toString().padStart(6, "0")}</span>
      </div>
      <div className="row small">
        <span>Date</span>
        <span>{format(new Date(sale.createdAt), "dd MMM yyyy")}</span>
      </div>
      <div className="row small">
        <span>Time</span>
        <span>{format(new Date(sale.createdAt), "hh:mm a")}</span>
      </div>
      <div className="row small">
        <span>Cashier</span>
        <span>{sale.cashierName || `User #${sale.cashierId}`}</span>
      </div>
      <div className="row small">
        <span>Customer</span>
        <span className="bold">{sale.customerName || "Walk-in"}</span>
      </div>

      <div className="dashed" />

      <table className="items">
        <tbody>
          {sale.items.map((it, i) => (
            <tr key={i}>
              <td colSpan={3} style={{ paddingTop: 4 }}>
                <div className="bold" style={{ lineHeight: 1.2 }}>
                  {it.productName}
                  {it.size ? (
                    <span style={{ marginLeft: 6, padding: "0 4px", border: "1px solid #000", borderRadius: 2, fontSize: 10 }}>
                      SIZE {it.size}
                    </span>
                  ) : null}
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
      <div className="row"><span>Tax (0%)</span><span>{formatPKR(0)}</span></div>
      <div className="dashed" />
      <div className="row total-row"><span>TOTAL</span><span>{formatPKR(sale.totalAmount)}</span></div>

      <div className="dashed" />

      <div className="center small" style={{ marginTop: 6 }}>
        Thank you for your business!
      </div>
      <div className="center small muted">
        Returns within 30 days with this invoice.
      </div>
      <div className="center small muted" style={{ marginTop: 6 }}>
        * * * * *
      </div>

      {/* Manual controls visible on screen only */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          background: "#111",
          borderRadius: 12,
          padding: 10,
          display: "flex",
          gap: 8,
          boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
        }}
      >
        <Button
          variant="outline"
          onClick={() => window.close()}
          className="bg-white text-black hover:bg-gray-100"
        >
          <X className="mr-2 h-4 w-4" />
          Close
        </Button>
        <Button
          onClick={() => void handlePrint()}
          disabled={printing}
          style={{ background: "#f63d25", color: "white" }}
        >
          {printing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : silentSent ? (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          ) : (
            <Printer className="mr-2 h-4 w-4" />
          )}
          {silentSent
            ? "Sent"
            : printing
            ? "Printing…"
            : hasReceiptPrinter
            ? "Print silently"
            : "Print Invoice"}
        </Button>
      </div>
    </div>
  );
}
