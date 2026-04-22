import { useEffect, useRef, useState } from "react";
import { Printer, X, Loader2, CheckCircle2 } from "lucide-react";
import type { Sale } from "@workspace/api-client-react";
import { ReceiptSlip } from "@/components/receipt/receipt-slip";
import { silentPrintPdf, getAssignedPrinter, isBrowserDialogForced } from "@/lib/printer-bridge";
import { renderReceiptPdf } from "@/lib/pdf/receipt-pdf";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const [printing, setPrinting] = useState(false);
  const [silentSent, setSilentSent] = useState(false);
  const autoPrintFired = useRef(false);

  /**
   * Try the silent printer bridge first; if no printer is assigned or the
   * bridge isn't running on this machine, fall back to the browser dialog.
   * The fallback keeps things working in cloud preview and on machines that
   * haven't been set up yet.
   */
  const handlePrint = async () => {
    if (!sale) return;
    setPrinting(true);
    try {
      const pdf = renderReceiptPdf(sale);
      const result = await silentPrintPdf("receipt", pdf, {
        jobName: `receipt_${sale.id}`,
        // No sizeMm — driver uses its native 80mm paper, PDF matches it.
      });
      if (result.ok) {
        setSilentSent(true);
        toast({
          title: "Receipt sent to printer",
          description: `Printed silently to ${getAssignedPrinter("receipt")}.`,
        });
        // Close shortly after — the slip is already on its way.
        setTimeout(onClose, 700);
      } else {
        // No printer assigned / QZ unavailable → open the PDF in a new tab so
        // the cashier can print from the browser's PDF viewer at the exact
        // 80 × 297 mm size (no CSS guesswork, no blank pages).
        const blob = new Blob([pdf as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank");
        if (!w) {
          toast({
            variant: "destructive",
            title: "Pop-up blocked",
            description: "Allow pop-ups for this site so the receipt PDF can open.",
          });
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not generate receipt",
        description: err?.message || "Unknown error",
      });
    } finally {
      setPrinting(false);
    }
  };

  // ESC closes; Cmd/Ctrl+P triggers the same flow as the Print button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        void handlePrint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // handlePrint is intentionally omitted — we always want the latest sale
    // captured by closure when the user presses the shortcut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, sale]);

  // When a fresh sale lands and autoPrint is on, run the silent flow once.
  useEffect(() => {
    if (!open || !sale || !autoPrint) return;
    if (autoPrintFired.current) return;
    autoPrintFired.current = true;
    void handlePrint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sale, autoPrint]);

  useEffect(() => {
    if (!open) {
      autoPrintFired.current = false;
      setSilentSent(false);
    }
  }, [open]);

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
            onClick={() => void handlePrint()}
            disabled={printing}
            className="flex-[2] h-11 rounded-md glossy-brand text-white font-semibold inline-flex items-center justify-center gap-2 hover:opacity-95 transition-opacity disabled:opacity-60"
          >
            {printing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : silentSent ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            {silentSent
              ? "Sent"
              : printing
              ? "Printing…"
              : getAssignedPrinter("receipt") && !isBrowserDialogForced()
              ? "Print silently"
              : "Print Receipt"}
          </button>
        </div>
      </div>
    </div>
  );
}
