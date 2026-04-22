import { jsPDF } from "jspdf";
import { format } from "date-fns";
import type { Sale } from "@workspace/api-client-react";

/**
 * Render an 80mm thermal receipt to a PDF and return its bytes.
 *
 * Width is fixed at 80 mm (printable area = inner 72 mm). Height is
 * dynamic — the page is exactly as long as the content needs. We do this
 * with a two-pass render: a measure pass to compute the cursor's final Y,
 * then a real pass on a page sized to (cursor + bottom margin).
 *
 * Layout mirrors the on-screen <ReceiptSlip /> component so what the cashier
 * sees in the preview is what comes out of the thermal printer.
 */
// 80mm thermal printers have ~72mm printable area (3-4mm unprintable strip
// on each side). Sizing the PDF to the FULL 80mm causes content on the right
// to be clipped because the printer driver centres the page on the print
// head. 72mm fits inside the printable area on every 80mm thermal we tested.
const PAGE_WIDTH_MM = 72;

export function renderReceiptPdf(sale: Sale): Uint8Array {
  const pageWidth = PAGE_WIDTH_MM; // mm

  // Pass 1 — measure on a tall scratch page (output discarded).
  const measureDoc = new jsPDF({
    unit: "mm",
    format: [pageWidth, 1000],
    orientation: "portrait",
  });
  const measuredHeight = drawReceipt(measureDoc, sale);

  // Pass 2 — real render on the right-sized page.
  const finalHeight = Math.max(60, measuredHeight);
  const doc = new jsPDF({
    unit: "mm",
    format: [pageWidth, finalHeight],
    orientation: "portrait",
  });
  drawReceipt(doc, sale);

  return new Uint8Array(doc.output("arraybuffer"));
}

/** Draws the receipt on `doc` and returns the final cursor Y (in mm). */
function drawReceipt(doc: jsPDF, sale: Sale): number {
  const pageWidth = PAGE_WIDTH_MM;
  const margin = 3;
  const innerWidth = pageWidth - margin * 2;
  const lineHeight = 3.6;

  let y = margin + 1;

  // ---- Brand header (centered) ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("De Luxury Boutique", pageWidth / 2, y + 4, { align: "center" });
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(80);
  doc.text("Retail Excellence", pageWidth / 2, y + 1, { align: "center" });
  doc.text("123 Commerce St., Karachi", pageWidth / 2, y + 4, { align: "center" });
  doc.text("Tel: (021) 1234-567", pageWidth / 2, y + 7, { align: "center" });
  y += 9;

  doc.setTextColor(0);
  drawDashedLine(doc, margin, y, pageWidth - margin);
  y += 2;

  // ---- Meta rows ----
  doc.setFontSize(7.5);
  drawRow(doc, margin, y, innerWidth, "Receipt #", sale.id.toString().padStart(6, "0"), true);
  y += lineHeight;
  drawRow(doc, margin, y, innerWidth, "Date", format(new Date(sale.createdAt), "dd MMM yyyy, hh:mm a"));
  y += lineHeight;
  drawRow(doc, margin, y, innerWidth, "Cashier", sale.cashierName || `User #${sale.cashierId}`);
  y += lineHeight;
  drawRow(doc, margin, y, innerWidth, "Customer", sale.customerName || "Walk-in", true);
  y += lineHeight + 1;

  drawDashedLine(doc, margin, y, pageWidth - margin);
  y += 2;

  // ---- Items ----
  doc.setFontSize(8);
  for (const it of sale.items) {
    doc.setFont("helvetica", "bold");
    const nameText = it.size ? `${it.productName}  [SIZE ${it.size}]` : it.productName;
    const nameLines = doc.splitTextToSize(nameText, innerWidth);
    doc.text(nameLines, margin, y + 2.5);
    y += nameLines.length * 3.2 + 0.5;

    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text(it.barcode, margin, y + 2);
    y += 3;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(0);
    drawRow(
      doc,
      margin,
      y,
      innerWidth,
      `${it.quantity} x ${formatPKR(it.price)}`,
      formatPKR(it.subtotal),
      true,
    );
    y += lineHeight + 1.5;
  }

  drawDashedLine(doc, margin, y, pageWidth - margin);
  y += 2;

  // ---- Totals ----
  doc.setFontSize(8);
  drawRow(doc, margin, y, innerWidth, "Subtotal", formatPKR(sale.totalAmount));
  y += lineHeight;
  drawRow(doc, margin, y, innerWidth, "Tax (0%)", formatPKR(0));
  y += lineHeight + 1;

  drawDashedLine(doc, margin, y, pageWidth - margin);
  y += 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  drawRow(doc, margin, y, innerWidth, "TOTAL", formatPKR(sale.totalAmount));
  y += 6;

  drawDashedLine(doc, margin, y, pageWidth - margin);
  y += 3;

  // ---- Footer ----
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Thank you for shopping with us!", pageWidth / 2, y + 1, { align: "center" });
  y += 3;
  doc.setTextColor(80);
  doc.text("Returns within 30 days with this receipt", pageWidth / 2, y + 1, { align: "center" });
  y += 4;
  doc.text("* * * * *", pageWidth / 2, y + 1, { align: "center" });
  y += margin + 2;

  return y;
}

function drawDashedLine(doc: jsPDF, x1: number, y: number, x2: number) {
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([0.6, 0.6], 0);
  doc.line(x1, y, x2, y);
  doc.setLineDashPattern([], 0);
}

function drawRow(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  left: string,
  right: string,
  rightBold = false,
) {
  doc.text(left, x, y + 2);
  if (rightBold) doc.setFont("helvetica", "bold");
  doc.text(right, x + width, y + 2, { align: "right" });
  if (rightBold) doc.setFont("helvetica", "normal");
}

function formatPKR(amount: number) {
  return (
    "Rs. " +
    Number(amount).toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
