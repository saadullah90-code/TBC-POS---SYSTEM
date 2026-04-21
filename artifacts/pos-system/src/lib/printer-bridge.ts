/**
 * Frontend client for the local printer bridge (`/api/print/*`).
 *
 * Persists per-role printer assignments in localStorage so the cashier picks
 * the printer once in Settings, then every receipt and barcode prints silently
 * to the right device with no browser dialog.
 */

import {
  listPrinters as listPrintersFn,
  submitPrintJob as submitPrintJobFn,
  type PrintersResponse,
  type PrintJobResponse,
} from "@workspace/api-client-react";

export type PrinterRole = "receipt" | "barcode";

const STORAGE_KEY = "branx_pos_printer_assignments_v1";

interface Assignments {
  receipt?: string;
  barcode?: string;
  /** When true, never call silent print — always fall back to the browser dialog. */
  forceBrowserDialog?: boolean;
}

function readAssignments(): Assignments {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Assignments;
  } catch {
    return {};
  }
}

function writeAssignments(a: Assignments) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  window.dispatchEvent(new CustomEvent("branx:printers-changed"));
}

export function getAssignedPrinter(role: PrinterRole): string | undefined {
  return readAssignments()[role] || undefined;
}

export function setAssignedPrinter(role: PrinterRole, name: string | null) {
  const a = readAssignments();
  if (name) a[role] = name;
  else delete a[role];
  writeAssignments(a);
}

export function isBrowserDialogForced(): boolean {
  return !!readAssignments().forceBrowserDialog;
}

export function setForceBrowserDialog(force: boolean) {
  const a = readAssignments();
  a.forceBrowserDialog = force;
  writeAssignments(a);
}

export async function fetchPrinters(): Promise<PrintersResponse> {
  return listPrintersFn();
}

/**
 * Send a generated PDF to the printer assigned to `role` and return whether
 * the bridge accepted the job. Returns `false` (without throwing) when:
 *   - the user has not assigned a printer for this role yet
 *   - the local bridge is not available (e.g. running in cloud preview)
 *   - the assigned printer rejected the job
 *
 * Callers should fall back to the browser print dialog when this returns
 * `false` so printing is never silently dropped.
 */
export async function silentPrintPdf(
  role: PrinterRole,
  pdfBytes: Uint8Array,
  opts: { copies?: number; jobName?: string } = {},
): Promise<{ ok: boolean; reason?: string; response?: PrintJobResponse }> {
  if (isBrowserDialogForced()) {
    return { ok: false, reason: "browser-dialog-forced" };
  }
  const printerName = getAssignedPrinter(role);
  if (!printerName) {
    return { ok: false, reason: "no-printer-assigned" };
  }
  const pdfBase64 = uint8ArrayToBase64(pdfBytes);
  try {
    const response = await submitPrintJobFn({
      printerName,
      pdfBase64,
      copies: opts.copies ?? 1,
      jobName: opts.jobName ?? null,
    });
    return { ok: !!response.ok, response };
  } catch (err: any) {
    return {
      ok: false,
      reason: err?.error || err?.message || "Bridge call failed",
    };
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Chunked to avoid call-stack overflow on large PDFs.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(slice) as number[]);
  }
  return btoa(binary);
}
