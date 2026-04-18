/**
 * In-app printing helper.
 *
 * Creates a hidden <iframe>, loads the given URL inside it, triggers the
 * browser's native print dialog against the iframe contents, and removes the
 * iframe once printing finishes. No new browser tab is ever opened.
 */
export function printDocument(path: string): void {
  // Resolve relative to the artifact's base path.
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.src = url;

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    try {
      iframe.parentNode?.removeChild(iframe);
    } catch {
      /* ignore */
    }
  };

  const triggerPrint = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    // Wait one frame so React inside the iframe has painted.
    setTimeout(() => {
      try {
        win.focus();
        const onAfterPrint = () => {
          win.removeEventListener("afterprint", onAfterPrint);
          // Small delay so the browser fully releases the print job.
          setTimeout(cleanup, 200);
        };
        win.addEventListener("afterprint", onAfterPrint);
        win.print();
        // Safety net: remove the iframe after 60s even if afterprint never fires.
        setTimeout(cleanup, 60_000);
      } catch (err) {
        console.error("Print failed:", err);
        cleanup();
      }
    }, 100);
  };

  iframe.onload = () => {
    // The printable pages signal readiness via window.__printReady.
    // We poll briefly so dynamic content (barcode canvases, fetched data)
    // has time to render before we open the print dialog.
    const win = iframe.contentWindow as (Window & { __printReady?: boolean }) | null;
    if (!win) {
      cleanup();
      return;
    }
    const start = Date.now();
    const tick = () => {
      if (win.__printReady || Date.now() - start > 4000) {
        triggerPrint();
      } else {
        setTimeout(tick, 80);
      }
    };
    tick();
  };

  iframe.onerror = cleanup;
  document.body.appendChild(iframe);
}

/**
 * Returns true when the current page is being rendered inside another window
 * (e.g. our hidden print iframe). Used by printable pages to skip their own
 * auto-print/auto-close logic and let the parent control timing.
 */
export function isEmbedded(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

/**
 * Mark the current document as ready for the parent print helper to invoke
 * the print dialog. Safe to call multiple times.
 */
export function signalPrintReady(): void {
  (window as Window & { __printReady?: boolean }).__printReady = true;
}
