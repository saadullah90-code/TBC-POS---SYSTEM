import { useEffect } from "react";
import { Printer, X } from "lucide-react";
import type { Sale } from "@workspace/api-client-react";
import { ReceiptSlip } from "@/components/receipt/receipt-slip";

interface Props {
  sale: Sale | null;
  open: boolean;
  onClose: () => void;
  /** When true, immediately fires the browser print dialog as soon as the slip mounts. */
  autoPrint?: boolean;
}

/**
 * Custom in-app receipt window.
 *
 * Opens instantly (no iframe load, no network refetch) using the Sale object
 * already in memory. Pressing "Print" triggers `window.print()` — the global
 * print CSS in `index.css` isolates `.receipt-slip` so only the receipt is
 * sent to the printer.
 *
 * NOTE: Browsers do not allow a web page to bypass the OS print dialog. For
 * truly silent printing, launch Chrome with `--kiosk-printing` and check
 * "Silent Printing" in your browser/printer settings.
 */
export function ReceiptPrintDialog({ sale, open, onClose, autoPrint }: Props) {
  // ESC closes; Cmd/Ctrl+P prints.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        window.print();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Auto-fire the browser print dialog the moment a fresh sale lands.
  useEffect(() => {
    if (!open || !sale || !autoPrint) return;
    // One animation frame so the slip is in the DOM before printing.
    const id = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(id);
  }, [open, sale, autoPrint]);

  // Auto-close once the OS print dialog is dismissed (whether printed or cancelled).
  useEffect(() => {
    if (!open) return;
    const onAfter = () => onClose();
    window.addEventListener("afterprint", onAfter);
    return () => window.removeEventListener("afterprint", onAfter);
  }, [open, onClose]);

  // Tell the global print CSS to isolate just the receipt while this dialog is open.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("print-receipt-only");
    return () => document.body.classList.remove("print-receipt-only");
  }, [open]);

  if (!open || !sale) return null;

  return (
    <div
      className="receipt-print-portal fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(92vw, 360px)" }}
      >
        {/* Header */}
        <div className="glossy-brand px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Printer className="w-4 h-4" />
            <span>Receipt #{sale.id.toString().padStart(6, "0")}</span>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Slip preview */}
        <div className="flex-1 overflow-y-auto bg-gray-100 p-4">
          <div className="bg-white shadow-md mx-auto">
            <ReceiptSlip sale={sale} />
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-200 bg-white p-3 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-11 rounded-md border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => window.print()}
            className="flex-[2] h-11 rounded-md glossy-brand text-white font-semibold inline-flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
          >
            <Printer className="w-4 h-4" />
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
