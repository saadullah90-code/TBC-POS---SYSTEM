import { useEffect, useMemo, useRef } from "react";
import { useParams } from "wouter";
import bwipjs from "bwip-js/browser";
import { isEmbedded, signalPrintReady } from "@/lib/print";
import { getLabelDimensions } from "@/lib/printer-bridge";

export default function BarcodePrint() {
  const params = useParams();
  const barcode = params.barcode as string;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const search = new URLSearchParams(window.location.search);
  const name = search.get("name") || "";
  const title = search.get("title") || "";
  const price = search.get("price") || "";
  const originalPriceRaw = search.get("originalPrice") || "";
  const size = search.get("size") || "";

  // Discount only kicks in when a numeric originalPrice strictly higher than
  // the sale price is provided in the URL. Anything else means "no discount".
  const priceNum = Number(price);
  const origNum = Number(originalPriceRaw);
  const hasDiscount =
    !!originalPriceRaw &&
    Number.isFinite(origNum) &&
    Number.isFinite(priceNum) &&
    origNum > priceNum;

  // Configured sticker dimensions — must match the printer driver exactly.
  const dims = useMemo(() => getLabelDimensions(), []);
  const wMm = dims.widthMm;
  const hMm = dims.heightMm;
  const minMm = Math.min(wMm, hMm);
  // Scale typography to label height so 30mm and 50mm rolls both look right.
  const baseScale = minMm / 30;
  const nameSize = Math.max(8, Math.min(12, 10 * baseScale));
  // Title (Short / POS name) used to be very thin and faded out on cheap
  // thermal labels. Bump to a bolder weight + bigger size so it stays
  // readable after one or two reprints.
  const titleSize = Math.max(8, Math.min(11, 9 * baseScale));
  const priceSize = Math.max(8, Math.min(12, 10 * baseScale));
  const barcodeMaxH = Math.max(8, hMm * 0.55);

  useEffect(() => {
    if (!barcode || !canvasRef.current) return;
    try {
      bwipjs.toCanvas(canvasRef.current, {
        bcid: "code128",
        text: barcode,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: "center",
        textsize: 8,
        paddingwidth: 4,
        paddingheight: 2,
      });
    } catch (e) {
      console.error("Error generating barcode:", e);
      return;
    }

    if (isEmbedded()) {
      signalPrintReady();
      return;
    }

    const t = setTimeout(() => window.print(), 300);
    const onAfterPrint = () => setTimeout(() => window.close(), 200);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [barcode]);

  return (
    <div className="label-root bg-white text-black flex items-center justify-center min-h-screen">
      <style>{`
        @page { size: ${wMm}mm ${hMm}mm; margin: 0; }
        @media print {
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .label-root { min-height: auto !important; }
        }
        .label {
          width: ${wMm}mm;
          height: ${hMm}mm;
          padding: ${Math.max(0.8, hMm * 0.05)}mm ${Math.max(1, wMm * 0.04)}mm;
          background: white;
          color: #000;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          font-family: ui-sans-serif, system-ui, sans-serif;
          box-sizing: border-box;
          overflow: hidden;
        }
      `}</style>
      <div className="label">
        {name && (
          <div style={{ fontSize: nameSize, fontWeight: 800, lineHeight: 1.1, marginBottom: 1, maxHeight: "2.4em", overflow: "hidden" }}>
            {name}
          </div>
        )}
        {title && title !== name && (
          <div style={{ fontSize: titleSize, fontWeight: 800, lineHeight: 1.1, marginBottom: 1, maxHeight: "2.2em", overflow: "hidden", color: "#000", letterSpacing: 0.3 }}>
            {title}
          </div>
        )}
        {hasDiscount && (
          <div
            style={{
              fontSize: priceSize * 0.82,
              fontWeight: 700,
              color: "#000",
              textDecoration: "line-through",
              textDecorationThickness: "1.5px",
              lineHeight: 1.05,
              marginBottom: 0,
              letterSpacing: 0.2,
            }}
          >
            Rs. {origNum.toLocaleString("en-PK", { maximumFractionDigits: 2 })}
          </div>
        )}
        <div style={{ fontSize: priceSize, fontWeight: 700, marginBottom: 1, display: "flex", gap: 6, alignItems: "baseline" }}>
          {price && <span>Rs. {Number(price).toLocaleString("en-PK", { maximumFractionDigits: 2 })}</span>}
          {size && <span style={{ fontSize: priceSize * 0.8, fontWeight: 700, padding: "0 4px", border: "1px solid #000", borderRadius: 2 }}>SIZE {size}</span>}
        </div>
        <canvas ref={canvasRef} style={{ maxWidth: "100%", maxHeight: `${barcodeMaxH}mm` }} />
      </div>
      <div className="no-print" style={{ position: "fixed", top: 8, left: 8, background: "#fffbe6", color: "#7a5c00", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
        {wMm.toFixed(2)} × {hMm.toFixed(2)} mm sticker label — auto-prints, then closes.
      </div>
    </div>
  );
}
