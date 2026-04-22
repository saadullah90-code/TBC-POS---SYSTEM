import { jsPDF } from "jspdf";
import { format } from "date-fns";
import type { Sale } from "@workspace/api-client-react";

/**
 * Render an 80mm thermal receipt to a PDF and return its bytes.
 *
 * Page is FIXED at 80 × 297 mm so every receipt comes out of the thermal
 * printer at the same size — no driver guessing, no surprise paper-cut
 * positions, no "preview blank" issues. Printable area is the inner 72 mm
 * (4 mm margin each side), matching the standard 80 mm thermal roll.
 *
 * Layout mirrors the on-screen <ReceiptSlip /> component so what the cashier
 * sees in the preview is what comes out of the thermal printer.
 */
export function renderReceiptPdf(sale: Sale): Uint8Array {
  const pageWidth = 80; // mm
  const pageHeight = 297; // mm (fixed — driver expects this exact page size)
  const margin = 4;
  const innerWidth = pageWidth - margin * 2; // 72 mm printable
  const lineHeight = 3.6; // mm per line @ ~10pt mono

  const doc = new jsPDF({
    unit: "mm",
    format: [pageWidth, pageHeight],
    orientation: "portrait",
  });

  let y = margin + 1;

  // ---- Brand header (centered) ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Brand Studio", pageWidth / 2, y + 4, { align: "center" });
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
    // Product name + size badge
    doc.setFont("helvetica", "bold");
    const nameText = it.size ? `${it.productName}  [SIZE ${it.size}]` : it.productName;
    const nameLines = doc.splitTextToSize(nameText, innerWidth);
    doc.text(nameLines, margin, y + 2.5);
    y += nameLines.length * 3.2 + 0.5;

    // Barcode
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text(it.barcode, margin, y + 2);
    y += 3;

    // Qty x price ............... subtotal
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
  doc.text("Returns within 30 days with this receipt", pageWidth / 2, y + 1, {
    align: "center",
  });
  y += 4;
  doc.text("* * * * *", pageWidth / 2, y + 1, { align: "center" });

  return new Uint8Array(doc.output("arraybuffer"));
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

