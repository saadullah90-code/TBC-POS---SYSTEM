import { useEffect, useMemo, useRef, useState } from "react";
import { useListProducts, Product, ProductVariant } from "@workspace/api-client-react";
import bwipjs from "bwip-js/browser";
import { Loader2 } from "lucide-react";
import { isEmbedded, signalPrintReady } from "@/lib/print";

interface LabelSpec {
  key: string;
  name: string;
  title: string;
  price: number;
  barcode: string;
  size: string | null;
}

function Label({ spec }: { spec: LabelSpec }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      bwipjs.toCanvas(ref.current, {
        bcid: "code128",
        text: spec.barcode,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: "center",
        textsize: 8,
        paddingwidth: 4,
        paddingheight: 2,
      });
    } catch (e) {
      console.error(e);
    }
  }, [spec.barcode]);
  return (
    <div className="label">
      <div className="label-name">{spec.name}</div>
      {spec.title && spec.title !== spec.name && (
        <div className="label-title">{spec.title}</div>
      )}
      <div className="label-line">
        <span className="label-price">
          Rs. {Number(spec.price).toLocaleString("en-PK", { maximumFractionDigits: 2 })}
        </span>
        {spec.size && <span className="label-size">SIZE {spec.size}</span>}
      </div>
      <canvas ref={ref} />
    </div>
  );
}

function specsForProduct(p: Product): LabelSpec[] {
  if (p.variants && p.variants.length > 0) {
    return p.variants.map((v: ProductVariant) => ({
      key: `v-${v.id}`,
      name: p.name,
      title: p.title,
      price: p.price,
      barcode: v.barcode,
      size: v.size,
    }));
  }
  return [
    {
      key: `p-${p.id}`,
      name: p.name,
      title: p.title,
      price: p.price,
      barcode: p.barcode,
      size: null,
    },
  ];
}

export default function BarcodePrintBulk() {
  const search = new URLSearchParams(window.location.search);
  const idsParam = search.get("ids") || "";
  const variantIdsParam = search.get("variantIds") || "";
  const copiesPerItem = Math.max(1, parseInt(search.get("copies") || "1", 10) || 1);

  const ids = useMemo(
    () =>
      idsParam
        .split(",")
        .map((s) => parseInt(s, 10))
        .filter((n) => !Number.isNaN(n)),
    [idsParam],
  );
  const variantIds = useMemo(
    () =>
      variantIdsParam
        .split(",")
        .map((s) => parseInt(s, 10))
        .filter((n) => !Number.isNaN(n)),
    [variantIdsParam],
  );

  const { data: products, isLoading } = useListProducts({});
  const [printed, setPrinted] = useState(false);

  const selected = useMemo(() => {
    if (!products) return [] as LabelSpec[];
    const productMap = new Map(products.map((p) => [p.id, p]));
    const list: LabelSpec[] = [];

    // Per-product (expand variants if any)
    for (const id of ids) {
      const p = productMap.get(id);
      if (!p) continue;
      const specs = specsForProduct(p);
      for (const s of specs) {
        for (let i = 0; i < copiesPerItem; i++) list.push(s);
      }
    }

    // Per-variant (single variants picked individually)
    if (variantIds.length > 0) {
      for (const p of products) {
        for (const v of p.variants ?? []) {
          if (variantIds.includes(v.id)) {
            const spec: LabelSpec = {
              key: `v-${v.id}`,
              name: p.name,
              title: p.title,
              price: p.price,
              barcode: v.barcode,
              size: v.size,
            };
            for (let i = 0; i < copiesPerItem; i++) list.push(spec);
          }
        }
      }
    }

    return list;
  }, [products, ids, variantIds, copiesPerItem]);

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
        .label-name { font-size: 9px; font-weight: 800; line-height: 1.1; margin-bottom: 1px; max-height: 2.4em; overflow: hidden; }
        .label-title { font-size: 7px; font-weight: 500; line-height: 1.1; margin-bottom: 1px; max-height: 2.2em; overflow: hidden; color: #333; }
        .label-line { display: flex; gap: 6px; align-items: baseline; margin-bottom: 1px; }
        .label-price { font-size: 9px; font-weight: 700; }
        .label-size { font-size: 8px; font-weight: 700; padding: 0 4px; border: 1px solid #000; border-radius: 2px; }
        .label canvas { max-width: 100%; max-height: 14mm; }

        @media screen {
          .bulk-root { padding: 24px; }
          .label { border: 1px dashed #ccc; margin: 8px; display: inline-flex; }
        }
      `}</style>

      <div className="no-print" style={{ position: "fixed", top: 8, left: 8, background: "#fffbe6", color: "#7a5c00", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
        Bulk print: {selected.length} label(s) — auto-prints, then closes.
      </div>

      {selected.map((s, i) => (
        <Label key={`${s.key}-${i}`} spec={s} />
      ))}
    </div>
  );
}
