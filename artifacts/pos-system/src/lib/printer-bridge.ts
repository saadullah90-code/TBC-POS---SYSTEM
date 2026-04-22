/**
 * Frontend client for the QZ Tray printer bridge.
 *
 * Persists per-role printer assignments in localStorage so the cashier picks
 * the printer once in Settings, then every receipt and barcode prints silently
 * to the right device with no browser dialog.
 *
 * All silent printing now goes through QZ Tray (see `qz-bridge.ts`). The
 * legacy `pdf-to-printer` API server bridge is no longer used — QZ Tray
 * runs on the user's local PC and the browser talks to it directly, so
 * silent printing works identically whether the API is local or in the cloud.
 */

import {
  connectQz,
  listQzPrinters,
  printPdfViaQz,
  getCurrentStatus as getQzStatus,
  type QzStatus,
} from "@/lib/qz-bridge";

export type PrinterRole = "receipt" | "barcode";

const STORAGE_KEY = "branx_pos_printer_assignments_v1";

export interface LabelDimensions {
  /** Physical sticker width in mm (the long edge for a typical 50×30mm label). */
  widthMm: number;
  /** Physical sticker height in mm. */
  heightMm: number;
  /**
   * Total roll width in mm INCLUDING any unused right-hand label and the gap
   * between columns. Set this when your label roll has 2 columns of stickers
   * side-by-side (2-up media) — content will be drawn on the LEFT label only,
   * but the page format will fill the whole roll so the print head's centred
   * position lands on the left sticker instead of the gap.
   *
   * Leave undefined (or equal to widthMm) for plain single-column rolls.
   */
  rollWidthMm?: number;
}

export const DEFAULT_LABEL_DIMENSIONS: LabelDimensions = {
  widthMm: 50,
  heightMm: 30,
};

interface Assignments {
  receipt?: string;
  barcode?: string;
  /** When true, never call silent print — always fall back to the browser dialog. */
  forceBrowserDialog?: boolean;
  /** Physical sticker size — must match the Zebra/label printer driver's page setup. */
  labelDimensions?: LabelDimensions;
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

export function getLabelDimensions(): LabelDimensions {
  const stored = readAssignments().labelDimensions;
  if (
    stored &&
    Number.isFinite(stored.widthMm) &&
    Number.isFinite(stored.heightMm) &&
    stored.widthMm > 5 &&
    stored.heightMm > 5
  ) {
    return stored;
  }
  return DEFAULT_LABEL_DIMENSIONS;
}

export function setLabelDimensions(dims: LabelDimensions) {
  const a = readAssignments();
  // Keep sub-mm precision (e.g. 3.20" = 81.28mm) — rounding to whole mm
  // breaks the 1:1 match with thermal-printer driver pages and is what causes
  // labels to drift across the perforation.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const widthMm = Math.max(10, Math.min(250, round2(dims.widthMm)));
  a.labelDimensions = {
    widthMm,
    heightMm: Math.max(10, Math.min(250, round2(dims.heightMm))),
    rollWidthMm:
      dims.rollWidthMm && dims.rollWidthMm > widthMm
        ? Math.max(widthMm, Math.min(300, round2(dims.rollWidthMm)))
        : undefined,
  };
  writeAssignments(a);
}

/**
 * Effective page width to send to the printer. For 2-up rolls this is the
 * full roll width (so the print head lands on the left sticker); for normal
 * rolls it equals the single label width.
 */
export function getPageWidthMm(dims: LabelDimensions = getLabelDimensions()): number {
  return dims.rollWidthMm && dims.rollWidthMm > dims.widthMm
    ? dims.rollWidthMm
    : dims.widthMm;
}

export const MM_PER_INCH = 25.4;
export const inchToMm = (inch: number): number => inch * MM_PER_INCH;
export const mmToInch = (mm: number): number => mm / MM_PER_INCH;

/**
 * Settings page expects this shape — kept stable when we migrated from the
 * pdf-to-printer API bridge to QZ Tray so the UI didn't need to change.
 */
export interface PrintersResponse {
  available: boolean;
  platform: string;
  printers: { name: string; isDefault: boolean; isVirtual?: boolean }[];
  /** Surfaced for the new QZ-aware status banner. */
  qzStatus: QzStatus;
  /** Last error encountered talking to QZ Tray, if any. */
  error?: string;
}

export async function fetchPrinters(
  opts: { includeVirtual?: boolean } = {},
): Promise<PrintersResponse> {
  try {
    await connectQz();
    const printers = await listQzPrinters({ includeVirtual: opts.includeVirtual });
    return {
      available: true,
      platform: "QZ Tray",
      printers,
      qzStatus: "connected",
    };
  } catch (err: unknown) {
    const message =
      (err as { message?: string } | null)?.message ||
      (typeof err === "string" ? err : "QZ Tray not reachable");
    return {
      available: false,
      platform: "QZ Tray",
      printers: [],
      qzStatus: getQzStatus(),
      error: message,
    };
  }
}

/**
 * Send a generated PDF to the printer assigned to `role` and return whether
 * the QZ Tray bridge accepted the job. Returns `{ ok: false }` (without throwing)
 * when:
 *   - the user has not assigned a printer for this role yet
 *   - QZ Tray is not running on this machine
 *   - the assigned printer rejected the job
 *
 * Callers should fall back to the browser print dialog when this returns
 * `false` so printing is never silently dropped.
 */
export async function silentPrintPdf(
  role: PrinterRole,
  pdfBytes: Uint8Array,
  opts: {
    copies?: number;
    jobName?: string;
    /** When set, tells QZ exactly what physical page size to use (label printers). */
    sizeMm?: { width: number; height: number };
  } = {},
): Promise<{ ok: boolean; reason?: string }> {
  if (isBrowserDialogForced()) {
    return { ok: false, reason: "browser-dialog-forced" };
  }
  const printerName = getAssignedPrinter(role);
  if (!printerName) {
    return { ok: false, reason: "no-printer-assigned" };
  }
  try {
    const pdfBase64 = uint8ArrayToBase64(pdfBytes);
    await printPdfViaQz(printerName, pdfBase64, {
      copies: opts.copies ?? 1,
      jobName: opts.jobName,
      sizeMm: opts.sizeMm,
    });
    return { ok: true };
  } catch (err: unknown) {
    const reason =
      (err as { message?: string } | null)?.message ||
      (typeof err === "string" ? err : "QZ Tray print failed");
    return { ok: false, reason };
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
