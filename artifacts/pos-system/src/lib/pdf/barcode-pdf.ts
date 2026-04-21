import { jsPDF } from "jspdf";
import bwipjs from "bwip-js/browser";
import { getLabelDimensions, type LabelDimensions } from "@/lib/printer-bridge";

export interface LabelSpec {
  name: string;
  title: string;
  price: number;
  barcode: string;
  size?: string | null;
}

export interface RenderLabelOptions {
  /** Override the user's configured label size. Defaults to whatever Settings has stored. */
  dimensions?: LabelDimensions;
  /** How many copies of EACH label to emit. Defaults to 1. */
  copiesPerLabel?: number;
}

/**
 * Render one or more sticker labels into a single multi-page PDF where each
 * sticker is exactly one PDF page. The page dimensions come from Settings so
 * the cashier can match whatever physical label roll their Zebra is loaded
 * with — this is what stops content from straddling two stickers.
 *
 * Layout (centered):
 *   1) Brand / product name (bold, wraps to 2 lines)
 *   2) Title + optional [SIZE X] badge (smaller, single line)
 *   3) Price (bold)
 *   4) Barcode image (scaled to fill remaining space without overflow)
 */
export async function renderBarcodeLabelsPdf(
  labels: LabelSpec[],
  copiesPerLabelArg: number = 1,
  optsOrDims?: RenderLabelOptions | LabelDimensions,
): Promise<Uint8Array> {
  if (labels.length === 0) {
    throw new Error("renderBarcodeLabelsPdf: no labels to print");
  }

  // Resolve options for backwards compatibility — older callers pass `(labels, copies)`.
  const opts: RenderLabelOptions =
    optsOrDims && "widthMm" in (optsOrDims as LabelDimensions)
      ? { dimensions: optsOrDims as LabelDimensions }
      : (optsOrDims as RenderLabelOptions) ?? {};

  const dims = opts.dimensions ?? getLabelDimensions();
  const copiesPerLabel = Math.max(1, Math.floor(opts.copiesPerLabel ?? copiesPerLabelArg ?? 1));

  const pageW = dims.widthMm;
  const pageH = dims.heightMm;
  // Pick orientation based on the actual aspect ratio so jsPDF never silently
  // swaps the dimensions on us. Page bounds will be exactly pageW × pageH.
  const orientation: "landscape" | "portrait" = pageW >= pageH ? "landscape" : "portrait";

  const doc = new jsPDF({
    unit: "mm",
    format: [pageW, pageH],
    orientation,
  });

  let firstPage = true;

  for (const label of labels) {
    const dataUrl = await renderBarcodePng(label.barcode);

    for (let copy = 0; copy < copiesPerLabel; copy++) {
      if (!firstPage) doc.addPage([pageW, pageH], orientation);
      firstPage = false;

      drawLabel(doc, label, dataUrl, pageW, pageH);
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

/**
 * Lay out a single sticker. All measurements are in mm and stay strictly
 * inside the page bounds so the printer's perforation never sees overflow.
 */
function drawLabel(
  doc: jsPDF,
  label: LabelSpec,
  barcodeDataUrl: string,
  pageW: number,
  pageH: number,
) {
  // Generous safety margin from the perforated edges on all sides.
  const marginX = Math.max(1.2, pageW * 0.04);
  const marginY = Math.max(1.0, pageH * 0.05);
  const innerW = pageW - marginX * 2;
  const cx = pageW / 2;

  // Scale typography to the label height so 30mm and 60mm rolls both look right.
  const baseScale = Math.min(pageW, pageH) / 30; // 1.0 at 30mm
  const nameSize = clamp(7 * baseScale, 6, 11);
  const titleSize = clamp(5.5 * baseScale, 4.5, 8);
  const priceSize = clamp(8 * baseScale, 6.5, 12);
  const lineH = (size: number) => size * 0.36;

  let y = marginY;

  // ----- Product name (up to 2 lines) -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(nameSize);
  doc.setTextColor(0);
  const nameLines = (doc.splitTextToSize(label.name || "", innerW) as string[]).slice(0, 2);
  for (const line of nameLines) {
    doc.text(line, cx, y + nameSize * 0.32, { align: "center", baseline: "alphabetic" });
    y += lineH(nameSize);
  }

  // ----- Title (single line, lighter) -----
  if (label.title && label.title !== label.name) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(titleSize);
    doc.setTextColor(80);
    const titleLine =
      (doc.splitTextToSize(label.title, innerW) as string[])[0] ?? "";
    doc.text(titleLine, cx, y + titleSize * 0.32, { align: "center" });
    y += lineH(titleSize);
    doc.setTextColor(0);
  }

  // ----- Price + optional size badge on one line -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(priceSize);
  const priceText = `Rs. ${Number(label.price).toLocaleString("en-PK", {
    maximumFractionDigits: 2,
  })}`;
  if (label.size) {
    const sizeText = `SIZE ${label.size}`;
    const priceWidth = doc.getTextWidth(priceText);
    doc.setFontSize(priceSize * 0.78);
    const sizeTextW = doc.getTextWidth(sizeText);
    const sizeBadgeW = sizeTextW + 1.8;
    const gap = 1.2;
    const totalW = priceWidth + gap + sizeBadgeW;
    const startX = cx - totalW / 2;

    doc.setFontSize(priceSize);
    doc.text(priceText, startX, y + priceSize * 0.32);

    const badgeY = y + priceSize * 0.04;
    const badgeH = priceSize * 0.36;
    doc.setLineWidth(0.2);
    doc.rect(startX + priceWidth + gap, badgeY, sizeBadgeW, badgeH);
    doc.setFontSize(priceSize * 0.78);
    doc.text(
      sizeText,
      startX + priceWidth + gap + sizeBadgeW / 2,
      badgeY + badgeH * 0.78,
      { align: "center" },
    );
  } else {
    doc.text(priceText, cx, y + priceSize * 0.32, { align: "center" });
  }
  y += lineH(priceSize) + 0.4;

  // ----- Barcode area -----
  // Reserve all remaining vertical space for the barcode itself, leaving a
  // tiny bottom gutter so nothing kisses the perforation.
  const bottomGutter = Math.max(0.6, pageH * 0.03);
  const barcodeAreaW = innerW;
  const barcodeAreaH = Math.max(6, pageH - y - bottomGutter);

  // Barcode PNGs are rendered with includetext:true so the human-readable
  // string is baked into the image. Centre it inside the remaining area.
  doc.addImage(
    barcodeDataUrl,
    "PNG",
    cx - barcodeAreaW / 2,
    y,
    barcodeAreaW,
    barcodeAreaH,
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

async function renderBarcodePng(text: string): Promise<string> {
  // Off-screen canvas — bwip-js draws crisp Code 128 with the human-readable
  // text included so it matches what the on-screen labels look like.
  const canvas = document.createElement("canvas");
  bwipjs.toCanvas(canvas, {
    bcid: "code128",
    text,
    scale: 4,
    height: 12,
    includetext: true,
    textxalign: "center",
    textsize: 9,
    paddingwidth: 4,
    paddingheight: 2,
    backgroundcolor: "FFFFFF",
  });
  return canvas.toDataURL("image/png");
}
