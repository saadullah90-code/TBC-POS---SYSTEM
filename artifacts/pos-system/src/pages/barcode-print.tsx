import { useEffect, useRef } from "react";
import { useParams } from "wouter";
import bwipjs from "bwip-js";

export default function BarcodePrint() {
  const params = useParams();
  const barcode = params.barcode as string;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const search = new URLSearchParams(window.location.search);
  const title = search.get("title") || "";
  const price = search.get("price") || "";

  useEffect(() => {
    if (!barcode || !canvasRef.current) return;
    try {
      bwipjs.toCanvas(canvasRef.current, {
        bcid: "code128",
        text: barcode,
        scale: 3,
        height: 12,
        includetext: true,
        textxalign: "center",
        textsize: 9,
        paddingwidth: 4,
        paddingheight: 2,
      });
    } catch (e) {
      console.error("Error generating barcode:", e);
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
        @page { size: 50mm 30mm; margin: 0; }
        @media print {
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .label-root { min-height: auto !important; }
        }
        .label {
          width: 50mm;
          height: 30mm;
          padding: 1.5mm 2mm;
          background: white;
          color: #000;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          font-family: ui-sans-serif, system-ui, sans-serif;
        }
      `}</style>
      <div className="label">
        {title && (
          <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.1, marginBottom: 1, maxHeight: "2.4em", overflow: "hidden" }}>
            {title}
          </div>
        )}
        {price && (
          <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 1 }}>
            Rs. {Number(price).toLocaleString("en-PK", { maximumFractionDigits: 2 })}
          </div>
        )}
        <canvas ref={canvasRef} style={{ maxWidth: "100%", maxHeight: "16mm" }} />
      </div>
      <div className="no-print" style={{ position: "fixed", top: 8, left: 8, background: "#fffbe6", color: "#7a5c00", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
        50×30mm sticker label — auto‑prints, then closes.
      </div>
    </div>
  );
}
