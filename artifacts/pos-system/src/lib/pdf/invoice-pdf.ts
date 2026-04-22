/**
 * 80mm thermal "Customer Invoice" PDF.
 *
 * Same paper size as the cashier receipt so it prints on the same thermal
 * roll — the only difference is the header reads "CUSTOMER INVOICE" and a
 * dedicated invoice number is shown. The user explicitly asked that the
 * invoice not be A4 anymore: thermal printers reject A4 pages by ejecting
 * the entire roll, so everything that prints from this app is now sized
 * for an 80mm receipt printer by default.
 */
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import type { Sale } from "@workspace/api-client-react";

// PDF page width matches the physical 80mm paper. Margins are ASYMMETRIC to
// compensate for the typical right-shift of 80mm thermal print heads — see
// the long comment in receipt-pdf.ts for the full reasoning.
const PAGE_WIDTH_MM = 80;
const MARGIN_LEFT_MM = 4;
const MARGIN_RIGHT_MM = 12;

export function renderInvoicePdf(sale: Sale): Uint8Array {
  const pageWidth = PAGE_WIDTH_MM; // mm
  const leftMargin = MARGIN_LEFT_MM;
  const rightMargin = MARGIN_RIGHT_MM;
  const innerWidth = pageWidth - leftMargin - rightMargin;
  const rightEdge = pageWidth - rightMargin;
  const centerX = leftMargin + innerWidth / 2;

  const itemRows = sale.items.reduce((acc, it) => {
    const len = (it.size ? it.productName.length + 8 : it.productName.length) + 2;
    return acc + (len > 30 ? 2 : 1) + 2;
  }, 0);
  const headerHeight = 30;
  const footerHeight = 22;
  const itemsHeight = itemRows * 7;
  const totalsHeight = 18;
  const pageHeight = Math.max(
    90,
    headerHeight + itemsHeight + totalsHeight + footerHeight,
  );

  const doc = new jsPDF({
    unit: "mm",
    format: [pageWidth, pageHeight],
    orientation: "portrait",
  });

  let y = 6;

  // ---- Brand header (centered) ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("De Luxury Boutique", centerX, y + 4, { align: "center" });
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(80);
  doc.text("Retail Excellence", centerX, y + 1, { align: "center" });
  doc.text("123 Commerce St., Karachi", centerX, y + 4, { align: "center" });
  doc.text("Tel: (021) 1234-567", centerX, y + 7, { align: "center" });
  y += 9;

  // Document type — what makes this an invoice rather than a receipt.
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("CUSTOMER INVOICE", centerX, y + 4, { align: "center" });
  y += 6;

  drawDashedLine(doc, leftMargin, y, rightEdge);
  y += 2;

  // ---- Meta rows ----
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  drawRow(
    doc,
    leftMargin,
    y,
    innerWidth,
    "Invoice #",
    sale.id.toString().padStart(6, "0"),
    true,
  );
  y += 3.6;
  drawRow(doc, leftMargin, y, innerWidth, "Date", format(new Date(sale.createdAt), "dd MMM yyyy"));
  y += 3.6;
  drawRow(doc, leftMargin, y, innerWidth, "Time", format(new Date(sale.createdAt), "hh:mm a"));
  y += 3.6;
  drawRow(doc, leftMargin, y, innerWidth, "Cashier", sale.cashierName || `User #${sale.cashierId}`);
  y += 3.6;
  drawRow(doc, leftMargin, y, innerWidth, "Customer", sale.customerName || "Walk-in", true);
  y += 3.6 + 1;

  drawDashedLine(doc, leftMargin, y, rightEdge);
  y += 2;

  // ---- Items ----
  doc.setFontSize(8);
  for (const it of sale.items) {
    doc.setFont("helvetica", "bold");
    const nameText = it.size ? `${it.productName}  [SIZE ${it.size}]` : it.productName;
    const nameLines = doc.splitTextToSize(nameText, innerWidth);
    doc.text(nameLines, leftMargin, y + 2.5);
    y += nameLines.length * 3.2 + 0.5;

    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text(it.barcode, leftMargin, y + 2);
    y += 3;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(0);
    drawRow(
      doc,
      leftMargin,
      y,
      innerWidth,
      `${it.quantity} x ${formatPKR(it.price)}`,
      formatPKR(it.subtotal),
      true,
    );
    y += 3.6 + 1.5;
  }

  drawDashedLine(doc, leftMargin, y, rightEdge);
  y += 2;

  // ---- Totals ----
  doc.setFontSize(8);
  drawRow(doc, leftMargin, y, innerWidth, "Subtotal", formatPKR(sale.totalAmount));
  y += 3.6;
  drawRow(doc, leftMargin, y, innerWidth, "Tax (0%)", formatPKR(0));
  y += 3.6 + 1;

  drawDashedLine(doc, leftMargin, y, rightEdge);
  y += 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  drawRow(doc, leftMargin, y, innerWidth, "TOTAL", formatPKR(sale.totalAmount));
  y += 6;

  drawDashedLine(doc, leftMargin, y, rightEdge);
  y += 3;

  // ---- Footer ----
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Thank you for your business!", centerX, y + 1, { align: "center" });
  y += 3;
  doc.setTextColor(80);
  doc.text("Returns within 30 days with this invoice.", centerX, y + 1, {
    align: "center",
  });
  y += 4;
  doc.text("This is an official BranX* invoice", centerX, y + 1, { align: "center" });

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
