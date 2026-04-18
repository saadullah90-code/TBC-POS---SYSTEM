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
    if (barcode && canvasRef.current) {
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

        setTimeout(() => {
          window.print();
        }, 500);
      } catch (e) {
        console.error("Error generating barcode:", e);
      }
    }
  }, [barcode]);

  return (
    <div className="w-full h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center justify-center w-[3in] h-[2in] p-2 text-center bg-white text-black">
        {title && (
          <div className="font-bold text-[13px] leading-tight mb-1 px-1 line-clamp-2 break-words">
            {title}
          </div>
        )}
        {price && (
          <div className="text-[12px] font-semibold mb-1">
            Rs. {Number(price).toLocaleString("en-PK", { maximumFractionDigits: 2 })}
          </div>
        )}
        <canvas ref={canvasRef} className="max-w-full" />
      </div>
      <div className="no-print absolute top-4 left-4 bg-yellow-100 text-yellow-800 p-2 rounded text-sm font-medium">
        This page is optimized for a 3x2 inch barcode label printer.
      </div>
    </div>
  );
}
