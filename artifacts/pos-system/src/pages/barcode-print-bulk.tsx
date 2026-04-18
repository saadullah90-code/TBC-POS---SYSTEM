import { useEffect, useMemo, useRef, useState } from "react";
import { useListProducts, Product } from "@workspace/api-client-react";
import bwipjs from "bwip-js";
import { Loader2 } from "lucide-react";
import { isEmbedded, signalPrintReady } from "@/lib/print";

function Label({ product }: { product: Product }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      bwipjs.toCanvas(ref.current, {
        bcid: "code128",
        text: product.barcode,
        scale: 3,
        height: 12,
        includetext: true,
        textxalign: "center",
        textsize: 9,
        paddingwidth: 4,
        paddingheight: 2,
      });
    } catch (e) {
      console.error(e);
    }
  }, [product.barcode]);
  return (
    <div className="label">
      <div className="label-title">{product.title || product.name}</div>
      <div className="label-price">
        Rs. {Number(product.price).toLocaleString("en-PK", { maximumFractionDigits: 2 })}
      </div>
      <canvas ref={ref} />
    </div>
  );
}

export default function BarcodePrintBulk() {
  const search = new URLSearchParams(window.location.search);
  const idsParam = search.get("ids") || "";
  const copiesPerItem = Math.max(1, parseInt(search.get("copies") || "1", 10) || 1);
  const ids = useMemo(
    () =>
      idsParam
        .split(",")
        .map((s) => parseInt(s, 10))
        .filter((n) => !Number.isNaN(n)),
    [idsParam],
  );

  const { data: products, isLoading } = useListProducts({});
  const [printed, setPrinted] = useState(false);

  const selected = useMemo(() => {
    if (!products) return [] as Product[];
    const map = new Map(products.map((p) => [p.id, p]));
    const list: Product[] = [];
    for (const id of ids) {
      const p = map.get(id);
      if (p) for (let i = 0; i < copiesPerItem; i++) list.push(p);
    }
    return list;
  }, [products, ids, copiesPerItem]);

  useEffect(() => {
    if (printed || !selected.length) return;
    setPrinted(true);

    if (isEmbedded()) {
      signalPrintReady();
      return;
    }

    const t = setTimeout(() => window.print(), 400);
    const onAfterPrint = () => setTimeout(() => window.close(), 200);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [selected, printed]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white text-black">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!selected.length) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white text-black">
        No products selected.
      </div>
    );
  }

  return (
    <div className="bulk-root bg-white text-black">
      <style>{`
        @page { size: 50mm 30mm; margin: 0; }
        @media print {
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
        }
        .bulk-root { font-family: ui-sans-serif, system-ui, sans-serif; }
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
          page-break-after: always;
          break-after: page;
          box-sizing: border-box;
          margin: 0 auto;
        }
        .label:last-child { page-break-after: auto; break-after: auto; }
        .label-title { font-size: 9px; font-weight: 700; line-height: 1.1; margin-bottom: 1px; max-height: 2.4em; overflow: hidden; }
        .label-price { font-size: 10px; font-weight: 700; margin-bottom: 1px; }
        .label canvas { max-width: 100%; max-height: 16mm; }

        @media screen {
          .bulk-root { padding: 24px; }
          .label { border: 1px dashed #ccc; margin: 8px; display: inline-flex; }
        }
      `}</style>

      <div className="no-print" style={{ position: "fixed", top: 8, left: 8, background: "#fffbe6", color: "#7a5c00", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
        Bulk print: {selected.length} label(s) — auto-prints, then closes.
      </div>

      {selected.map((p, i) => (
        <Label key={`${p.id}-${i}`} product={p} />
      ))}
    </div>
  );
}
