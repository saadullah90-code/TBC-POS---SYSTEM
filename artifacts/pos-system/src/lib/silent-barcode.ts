import {
  silentPrintPdf,
  getAssignedPrinter,
  isBrowserDialogForced,
  getLabelDimensions,
} from "./printer-bridge";
import { renderBarcodeLabelsPdf, type LabelSpec } from "./pdf/barcode-pdf";
import { printDocument } from "./print";
import { getCurrentStatus as getQzStatus } from "./qz-bridge";
import { toast } from "@/hooks/use-toast";

/**
 * Try to silent-print one or more barcode labels via the local label printer
 * and fall back to the existing iframe print route when no printer is set up.
 *
 * Critical rule: if the user has assigned a barcode printer in Settings, we
 * MUST send the job to that printer. We never silently fall back to the OS
 * default (which is what was happening before — labels would land on the
 * receipt printer because the browser's print dialog defaults to the last
 * used device). When QZ Tray isn't running, surface a clear error instead.
 */
export async function silentPrintBarcodeLabels(
  labels: LabelSpec[],
  fallbackUrl: string,
  copies: number = 1,
): Promise<void> {
  if (labels.length === 0) return;

  const assigned = getAssignedPrinter("barcode");
  const forced = isBrowserDialogForced();

  // No printer assigned (or user explicitly forced the browser dialog) →
  // fall back to the legacy preview route so they can pick a device.
  if (!assigned || forced) {
    printDocument(fallbackUrl);
    return;
  }

  // QZ Tray must be connected for the assignment to mean anything.
  if (getQzStatus() !== "connected") {
    toast({
      variant: "destructive",
      title: "QZ Tray not connected",
      description:
        `Barcode labels are set to print on "${assigned}" but QZ Tray isn't running. ` +
        `Start QZ Tray and try again — labels won't be sent to the wrong printer.`,
    });
    return;
  }

  try {
    const dims = getLabelDimensions();
    const pdf = await renderBarcodeLabelsPdf(labels, copies);
    // Pass exact mm dimensions so QZ tells the printer driver the page size —
    // critical for Zebra-class label printers that otherwise auto-rescale.
    const result = await silentPrintPdf("barcode", pdf, {
      jobName: "barcode_labels",
      sizeMm: { width: dims.widthMm, height: dims.heightMm },
    });
    if (result.ok) {
      toast({
        title: `Sent ${labels.length * copies} label(s) to printer`,
        description: `Printer: ${assigned}`,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Label print failed",
        description: result.reason
          ? `${assigned} rejected the job: ${result.reason}`
          : `Could not send to ${assigned}.`,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    toast({
      variant: "destructive",
      title: "Label print failed",
      description: message,
    });
  }
}
