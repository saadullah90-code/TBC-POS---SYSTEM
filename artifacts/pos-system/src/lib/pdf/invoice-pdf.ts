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

export function renderInvoicePdf(sale: Sale): Uint8Array {
  const pageWidth = 80; // mm
  const margin = 4;
  const innerWidth = pageWidth - margin * 2;

  const itemRows = sale.items.reduce((acc, it) => {
    const len = (it.size ? it.productName.length + 8 : it.productName.length) + 2;
    return acc + (len > 36 ? 2 : 1) + 2;
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

  // Document type — what makes this an invoice rather than a receipt.
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("CUSTOMER INVOICE", pageWidth / 2, y + 4, { align: "center" });
  y += 6;

  drawDashedLine(doc, margin, y, pageWidth - margin);
  y += 2;

  // ---- Meta rows ----
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  drawRow(
    doc,
    margin,
    y,
    innerWidth,
    "Invoice #",
    sale.id.toString().padStart(6, "0"),
    true,
  );
  y += 3.6;
  drawRow(doc, margin, y, innerWidth, "Date", format(new Date(sale.createdAt), "dd MMM yyyy"));
  y += 3.6;
  drawRow(doc, margin, y, innerWidth, "Time", format(new Date(sale.createdAt), "hh:mm a"));
  y += 3.6;
  drawRow(doc, margin, y, innerWidth, "Cashier", sale.cashierName || `User #${sale.cashierId}`);
  y += 3.6;
  drawRow(doc, margin, y, innerWidth, "Customer", sale.customerName || "Walk-in", true);
  y += 3.6 + 1;

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
    y += 3.6 + 1.5;
  }

  drawDashedLine(doc, margin, y, pageWidth - margin);
  y += 2;

  // ---- Totals ----
  doc.setFontSize(8);
  drawRow(doc, margin, y, innerWidth, "Subtotal", formatPKR(sale.totalAmount));
  y += 3.6;
  drawRow(doc, margin, y, innerWidth, "Tax (0%)", formatPKR(0));
  y += 3.6 + 1;

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
  doc.text("Thank you for your business!", pageWidth / 2, y + 1, { align: "center" });
  y += 3;
  doc.setTextColor(80);
  doc.text("Returns within 30 days with this invoice.", pageWidth / 2, y + 1, {
    align: "center",
  });
  y += 4;
  doc.text("This is an official BranX* invoice", pageWidth / 2, y + 1, { align: "center" });

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
