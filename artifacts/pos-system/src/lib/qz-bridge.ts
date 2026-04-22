/**
 * QZ Tray bridge.
 *
 * Connects the browser to the locally-installed QZ Tray daemon
 * (https://qz.io) via its WebSocket API at wss://localhost:8181.
 * That daemon talks directly to the OS print spooler, so prints go
 * straight to the assigned printer with NO browser print dialog —
 * the cashier just clicks "Print" and the receipt comes out.
 *
 * Why this beats the old `pdf-to-printer` API bridge:
 *   - Works regardless of where the API server is hosted (Replit cloud,
 *     LAN, etc). QZ Tray runs on the user's PC; the browser talks to it
 *     directly.
 *   - Same setup on Windows / macOS / Linux.
 *   - Supports raw ZPL/EPL for thermal label printers when needed.
 *
 * Trust prompt:
 *   First time the page tries to print, QZ Tray will pop a "Allow this
 *   site to print?" dialog. Tick "Remember" and click Allow — every
 *   subsequent print is silent. (Eliminating that prompt entirely
 *   requires a code-signing certificate from QZ Industries.)
 */

// qz-tray ships UMD without TypeScript types — declared module below.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import qz from "qz-tray";

export type QzStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "unavailable";

let initialized = false;
let connectingPromise: Promise<void> | null = null;
let lastError: string | null = null;
const listeners = new Set<(status: QzStatus, error: string | null) => void>();

function emit(status: QzStatus) {
  for (const fn of listeners) {
    try {
      fn(status, lastError);
    } catch {
      /* listener errors must not crash the bridge */
    }
  }
}

/**
 * Subscribe to status changes. Returns an unsubscribe function.
 * Always called once with the current status as a synchronous warmup.
 */
export function subscribeQzStatus(
  fn: (status: QzStatus, error: string | null) => void,
): () => void {
  listeners.add(fn);
  fn(getCurrentStatus(), lastError);
  return () => {
    listeners.delete(fn);
  };
}

export function getCurrentStatus(): QzStatus {
  if (!initialized) return "idle";
  if (connectingPromise) return "connecting";
  try {
    return qz.websocket.isActive() ? "connected" : "disconnected";
  } catch {
    return "disconnected";
  }
}

function ensureInit() {
  if (initialized) return;
  initialized = true;

  // ---- Unsigned mode (community / dev) ----
  // Without a signing cert, QZ Tray shows a one-time "Allow this site"
  // prompt. The promises below tell qz-tray we are intentionally not
  // signing anything, so it skips the cert dance and just asks the user.
  qz.security.setCertificatePromise((resolve: (v: string) => void) => {
    resolve("");
  });
  qz.security.setSignaturePromise(
    () => (resolve: (v: string) => void) => {
      resolve("");
    },
  );

  // Reflect connection drops to subscribers (e.g. user quits QZ Tray).
  try {
    qz.websocket.setClosedCallbacks(() => {
      emit("disconnected");
    });
    qz.websocket.setErrorCallbacks((err: unknown) => {
      lastError =
        (err as { message?: string } | null)?.message ||
        (typeof err === "string" ? err : "QZ Tray websocket error");
      emit(getCurrentStatus());
    });
  } catch {
    /* older qz-tray versions don't expose these — non-fatal */
  }
}

/**
 * Open the WebSocket to QZ Tray. Resolves when connected, rejects with a
 * helpful message when QZ Tray is not running. Safe to call repeatedly —
 * dedupes concurrent calls and short-circuits when already connected.
 */
export async function connectQz(): Promise<void> {
  ensureInit();
  if (qz.websocket.isActive()) return;
  if (connectingPromise) return connectingPromise;

  lastError = null;
  emit("connecting");

  connectingPromise = (async () => {
    try {
      await qz.websocket.connect({
        // 3 quick retries with 1 sec spacing — enough to ride out a
        // freshly-started QZ Tray that's still binding the socket.
        retries: 3,
        delay: 1,
      });
      emit("connected");
    } catch (err: unknown) {
      lastError =
        (err as { message?: string } | null)?.message ||
        (typeof err === "string"
          ? err
          : "Could not reach QZ Tray on wss://localhost:8181");
      emit("unavailable");
      throw new Error(lastError);
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

export async function disconnectQz(): Promise<void> {
  if (!initialized) return;
  if (qz.websocket.isActive()) {
    await qz.websocket.disconnect();
  }
  emit("disconnected");
}

interface QzPrinterInfo {
  name: string;
  isDefault: boolean;
  /** True when the printer name matches a known Windows virtual / non-physical printer. */
  isVirtual: boolean;
}

// Common Windows virtual printers that pollute the dropdown — PDF writers,
// XPS, Fax, OneNote, "Send to" helpers, document image writers, etc. We hide
// these by default and let Settings reveal them via a toggle.
const VIRTUAL_PRINTER_PATTERNS: RegExp[] = [
  /microsoft print to pdf/i,
  /microsoft xps document writer/i,
  /microsoft document image writer/i,
  /^fax$/i,
  /onenote/i,
  /onenote for windows/i,
  /send to onenote/i,
  /snipping tool/i,
  /snip\s*&\s*sketch/i,
  /print to pdf/i,
  /pdf(\s|-)?creator/i,
  /cutepdf/i,
  /foxit reader pdf printer/i,
  /adobe pdf/i,
  /web service for/i,
];

export function isVirtualPrinter(name: string): boolean {
  return VIRTUAL_PRINTER_PATTERNS.some((re) => re.test(name));
}

/**
 * List installed printers reported by the OS to QZ Tray. Auto-connects
 * first and surfaces a clear error when QZ Tray is offline so the
 * caller can render a meaningful message.
 *
 * Pass `{ includeVirtual: true }` to include "Microsoft Print to PDF",
 * "OneNote", "Fax", and similar non-physical printers (filtered out by
 * default to keep the Settings dropdown short and physical-only).
 */
export async function listQzPrinters(
  opts: { includeVirtual?: boolean } = {},
): Promise<QzPrinterInfo[]> {
  await connectQz();
  const result = await qz.printers.find();
  const names: string[] = Array.isArray(result) ? result : result ? [result] : [];

  let defaultName: string | null = null;
  try {
    const def = await qz.printers.getDefault();
    defaultName = typeof def === "string" ? def : (def as { name?: string })?.name ?? null;
  } catch {
    defaultName = null;
  }

  const all: QzPrinterInfo[] = names.map((name) => ({
    name,
    isDefault: name === defaultName,
    isVirtual: isVirtualPrinter(name),
  }));

  return opts.includeVirtual ? all : all.filter((p) => !p.isVirtual);
}

export interface QzPdfPrintOptions {
  copies?: number;
  jobName?: string;
  /** Optional explicit page size — needed for label printers so QZ tells the driver the exact mm. */
  sizeMm?: { width: number; height: number };
  /** Default false: never let QZ scale the PDF, our PDFs are already exact. */
  scaleContent?: boolean;
  orientation?: "portrait" | "landscape" | "reverse-landscape";
}

/**
 * Send a base64-encoded PDF to the named printer.
 *
 * `scaleContent: false` is critical for label printers: our jspdf-rendered
 * PDF already matches the physical sticker dimensions to the millimetre,
 * any scaling here would push barcodes across the perforation.
 */
export async function printPdfViaQz(
  printerName: string,
  pdfBase64: string,
  opts: QzPdfPrintOptions = {},
): Promise<void> {
  await connectQz();

  const config = qz.configs.create(printerName, {
    copies: opts.copies ?? 1,
    jobName: opts.jobName ?? "BranX POS",
    scaleContent: opts.scaleContent ?? false,
    rasterize: false,
    units: "mm",
    ...(opts.sizeMm
      ? {
          size: { width: opts.sizeMm.width, height: opts.sizeMm.height },
        }
      : {}),
    ...(opts.orientation ? { orientation: opts.orientation } : {}),
  });

  await qz.print(config, [
    {
      type: "pixel",
      format: "pdf",
      flavor: "base64",
      data: pdfBase64,
    },
  ]);
}

/**
 * Send a raw ZPL/EPL command string straight to a Zebra-class printer.
 * Bypasses PDF rasterization entirely — the printer interprets the
 * commands natively, giving the crispest possible barcodes.
 */
export async function printRawViaQz(
  printerName: string,
  rawCommands: string,
  opts: { copies?: number; jobName?: string } = {},
): Promise<void> {
  await connectQz();
  const config = qz.configs.create(printerName, {
    copies: opts.copies ?? 1,
    jobName: opts.jobName ?? "BranX POS RAW",
  });
  await qz.print(config, [
    { type: "raw", format: "command", flavor: "plain", data: rawCommands },
  ]);
}
