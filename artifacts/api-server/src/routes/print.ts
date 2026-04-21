import { Router, type IRouter, json as expressJson } from "express";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { SubmitPrintJobBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Per-route body limit so a 100MB PDF can't OOM the API process.
const PRINT_BODY_LIMIT = "12mb";

// Anyone with an active POS session can print; rejecting unauthenticated
// requests stops other devices on the LAN from spraying paper at the printer.
function requireSession(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

router.use("/print", requireSession);
router.use("/print", expressJson({ limit: PRINT_BODY_LIMIT }));

/**
 * Local printer bridge.
 *
 * The API server runs on the SAME Windows/Mac/Linux machine as the cashier's
 * browser, so we can call the OS print spooler directly here. This is what
 * lets the POS print silently to a specific assigned printer without ever
 * showing the browser's print dialog.
 *
 * Implementation: dynamically imports `pdf-to-printer` (which uses the
 * platform-native `RUNDLL32 print` / SumatraPDF on Windows, `lp`/`lpr` on
 * macOS+Linux). Imported lazily so the build never crashes if the package is
 * missing on a CI/headless machine — the endpoints simply respond with
 * `available: false` and the frontend falls back to the browser print dialog.
 */

type PdfToPrinter = {
  getPrinters: () => Promise<Array<{ name?: string; deviceId?: string } | string>>;
  getDefaultPrinter?: () => Promise<{ name?: string; deviceId?: string } | string | null>;
  print: (
    pdf: string,
    opts?: { printer?: string; copies?: number; silent?: boolean },
  ) => Promise<void>;
};

let cachedModule: PdfToPrinter | null | undefined;

async function loadPrinterModule(): Promise<PdfToPrinter | null> {
  if (cachedModule !== undefined) return cachedModule;
  try {
    const mod = (await import("pdf-to-printer")) as unknown as PdfToPrinter & {
      default?: PdfToPrinter;
    };
    cachedModule = (mod.default && typeof mod.default.print === "function" ? mod.default : mod) as PdfToPrinter;
    return cachedModule;
  } catch (err) {
    logger.warn({ err }, "pdf-to-printer not available — silent printing disabled");
    cachedModule = null;
    return null;
  }
}

function nameOf(p: { name?: string; deviceId?: string } | string | null | undefined): string | null {
  if (!p) return null;
  if (typeof p === "string") return p;
  return p.name ?? p.deviceId ?? null;
}

router.get("/print/printers", async (_req, res): Promise<void> => {
  const platform = process.platform;
  const mod = await loadPrinterModule();
  if (!mod) {
    res.json({ available: false, platform, printers: [] });
    return;
  }
  try {
    const list = await mod.getPrinters();
    let defaultName: string | null = null;
    if (mod.getDefaultPrinter) {
      try {
        defaultName = nameOf(await mod.getDefaultPrinter());
      } catch {
        defaultName = null;
      }
    }
    const printers = list
      .map((p) => nameOf(p))
      .filter((n): n is string => !!n)
      .map((name) => ({ name, isDefault: name === defaultName }));
    res.json({ available: true, platform, printers });
  } catch (err) {
    logger.error({ err }, "Failed to list printers");
    res.json({ available: false, platform, printers: [] });
  }
});

router.post("/print/job", async (req, res): Promise<void> => {
  const parsed = SubmitPrintJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { printerName, pdfBase64, copies, jobName } = parsed.data;

  // Defensive validation: printer names should be plain identifiers as reported
  // by the OS — reject anything with control characters or shell metacharacters
  // even though pdf-to-printer spawns arguments without a shell.
  if (
    typeof printerName !== "string" ||
    printerName.length === 0 ||
    printerName.length > 200 ||
    /[\u0000-\u001F\u007F`$;|&<>\\]/.test(printerName)
  ) {
    res.status(400).json({ error: "Invalid printerName" });
    return;
  }

  const mod = await loadPrinterModule();
  if (!mod) {
    res.status(500).json({
      error:
        "Local printer bridge unavailable. Ensure the POS API server is running on the same machine as the printer.",
    });
    return;
  }

  // Decode PDF and write to a temp file. pdf-to-printer needs a file path.
  let buf: Buffer;
  try {
    buf = Buffer.from(pdfBase64, "base64");
    if (buf.length < 32) throw new Error("PDF payload too small");
  } catch (err) {
    res.status(400).json({ error: "Invalid pdfBase64 payload" });
    return;
  }

  const safe = (jobName || "branx-pos").replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40);
  const tmpPath = path.join(
    os.tmpdir(),
    `branx_${safe}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`,
  );

  try {
    await fs.writeFile(tmpPath, buf);
    await mod.print(tmpPath, {
      printer: printerName,
      copies: copies ?? 1,
      silent: true,
    });
    res.json({ ok: true, printerName, message: null });
  } catch (err: any) {
    logger.error({ err, printerName }, "Silent print failed");
    res.status(500).json({
      error: err?.message || "Print failed",
    });
  } finally {
    // The OS spooler has already copied the file by the time pdf-to-printer
    // resolves, so it's safe to delete immediately. We also fall back to a
    // delayed unlink in case the immediate one races with the spooler.
    fs.unlink(tmpPath).catch(() => {
      setTimeout(() => {
        fs.unlink(tmpPath).catch(() => {});
      }, 5000);
    });
  }
});

export default router;
