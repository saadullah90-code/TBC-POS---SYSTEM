import { useEffect, useRef } from "react";

/**
 * Global barcode-scanner listener.
 *
 * Most USB/Bluetooth barcode scanners act as HID keyboards: they "type"
 * the barcode characters very fast and then send Enter. This hook listens
 * at the document level so a scan is captured even if the focus has
 * drifted away from the dedicated scanner input.
 *
 * Heuristics:
 *  - Average inter-key delay must be <= maxAvgDelayMs (default 35ms)
 *  - Total chars >= minLength (default 4) before Enter
 *  - Ignore when typing inside text inputs / textareas / contentEditable,
 *    UNLESS the input is explicitly tagged data-scanner="true".
 */
export function useBarcodeScanner(
  onScan: (code: string) => void,
  opts: { minLength?: number; maxAvgDelayMs?: number; enabled?: boolean } = {},
) {
  const { minLength = 4, maxAvgDelayMs = 35, enabled = true } = opts;
  const buf = useRef<string>("");
  const timestamps = useRef<number[]>([]);
  const onScanRef = useRef(onScan);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    const reset = () => { buf.current = ""; timestamps.current = []; };

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isScannerInput = target?.getAttribute?.("data-scanner") === "true";
      const isEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          (target as HTMLElement).isContentEditable);

      // If the user is typing in a normal field (not the scanner input), do nothing.
      if (isEditable && !isScannerInput) return;

      if (e.key === "Enter") {
        const code = buf.current;
        const stamps = timestamps.current;
        if (code.length >= minLength && stamps.length >= 2) {
          const deltas: number[] = [];
          for (let i = 1; i < stamps.length; i++) deltas.push(stamps[i] - stamps[i - 1]);
          const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
          if (avg <= maxAvgDelayMs) {
            e.preventDefault();
            onScanRef.current(code);
            reset();
            return;
          }
        }
        // If we got Enter from the scanner input but failed heuristic,
        // still let the input's own onKeyDown handle it.
        reset();
        return;
      }

      if (e.key.length === 1) {
        // Restart buffer if too long since last keystroke
        const now = performance.now();
        const last = timestamps.current[timestamps.current.length - 1];
        if (last && now - last > 200) reset();
        buf.current += e.key;
        timestamps.current.push(now);
      }
    };

    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [minLength, maxAvgDelayMs, enabled]);
}
