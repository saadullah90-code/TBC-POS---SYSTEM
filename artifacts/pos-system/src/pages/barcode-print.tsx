import { useEffect, useRef } from "react";
import { useParams } from "wouter";
import bwipjs from "bwip-js";

export default function BarcodePrint() {
  const params = useParams();
  const barcode = params.barcode as string;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (barcode && canvasRef.current) {
      try {
        bwipjs.toCanvas(canvasRef.current, {
          bcid: "code128",       // Barcode type
          text: barcode,         // Text to encode
          scale: 3,              // 3x scaling factor
          height: 10,            // Bar height, in millimeters
          includetext: true,     // Show human-readable text
          textxalign: "center",  // Always good to set this
        });
        
        // Print automatically after rendering
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
      <div className="flex flex-col items-center justify-center print-only w-[3in] h-[2in] p-4 text-center border border-dashed border-gray-300 no-print:border-none">
        <canvas ref={canvasRef} className="max-w-full" />
      </div>
      <div className="no-print absolute top-4 left-4 bg-yellow-100 text-yellow-800 p-2 rounded text-sm font-medium">
        This page is optimized for a 3x2 inch barcode label printer.
      </div>
    </div>
  );
}
