import { silentPrintPdf, getAssignedPrinter, isBrowserDialogForced } from "./printer-bridge";
import { renderBarcodeLabelsPdf, type LabelSpec } from "./pdf/barcode-pdf";
import { printDocument } from "./print";

/**
 * Try to silent-print one or more barcode labels via the local label printer
 * and fall back to the existing iframe print route when no printer is set up.
 *
 * `fallbackUrl` is the printer-friendly route used by the legacy preview pipeline
 * (e.g. `/inventory/barcode-print/...?...` or `/inventory/barcode-print-bulk?...`).
 */
export async function silentPrintBarcodeLabels(
  labels: LabelSpec[],
  fallbackUrl: string,
  copies: number = 1,
): Promise<void> {
  const hasPrinter = !!getAssignedPrinter("barcode") && !isBrowserDialogForced();
  if (!hasPrinter || labels.length === 0) {
    printDocument(fallbackUrl);
    return;
  }
  try {
    const pdf = await renderBarcodeLabelsPdf(labels, copies);
    const result = await silentPrintPdf("barcode", pdf, { jobName: "barcode_labels" });
    if (!result.ok) {
      printDocument(fallbackUrl);
    }
  } catch {
    printDocument(fallbackUrl);
  }
}
