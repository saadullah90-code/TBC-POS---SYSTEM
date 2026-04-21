import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Printer,
  Receipt,
  Tag,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Plug,
  PlugZap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  fetchPrinters,
  getAssignedPrinter,
  setAssignedPrinter,
  isBrowserDialogForced,
  setForceBrowserDialog,
  silentPrintPdf,
  getLabelDimensions,
  setLabelDimensions,
  DEFAULT_LABEL_DIMENSIONS,
  inchToMm,
  mmToInch,
  type LabelDimensions,
} from "@/lib/printer-bridge";
import {
  connectQz,
  disconnectQz,
  subscribeQzStatus,
  type QzStatus,
} from "@/lib/qz-bridge";
import { renderReceiptPdf } from "@/lib/pdf/receipt-pdf";
import { renderBarcodeLabelsPdf } from "@/lib/pdf/barcode-pdf";

const LABEL_PRESETS: { label: string; dims: LabelDimensions }[] = [
  // Matches the Zebra GK888t (EPL) "User defined" 3.20 × 1.10 inch default
  // most retail label rolls in PK come pre-cut for.
  {
    label: "Zebra GK888t — 3.20 × 1.10 in (81.28 × 27.94 mm)",
    dims: { widthMm: inchToMm(3.2), heightMm: inchToMm(1.1) },
  },
  { label: "50 × 30 mm", dims: { widthMm: 50, heightMm: 30 } },
  { label: "40 × 30 mm", dims: { widthMm: 40, heightMm: 30 } },
  { label: "58 × 40 mm", dims: { widthMm: 58, heightMm: 40 } },
  { label: "30 × 50 mm (portrait)", dims: { widthMm: 30, heightMm: 50 } },
  { label: "100 × 50 mm", dims: { widthMm: 100, heightMm: 50 } },
  { label: "4 × 6 in (101.6 × 152.4 mm)", dims: { widthMm: inchToMm(4), heightMm: inchToMm(6) } },
];

type Unit = "mm" | "in";

function dimsApproxEqual(a: LabelDimensions, b: LabelDimensions): boolean {
  return Math.abs(a.widthMm - b.widthMm) < 0.05 && Math.abs(a.heightMm - b.heightMm) < 0.05;
}

function fmtMm(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}
function fmtIn(mm: number): string {
  return (Math.round(mmToInch(mm) * 100) / 100).toString();
}

function LabelSizeCard({
  value,
  onSave,
  onChange,
}: {
  value: LabelDimensions;
  onSave: (v: LabelDimensions) => void;
  onChange: (v: LabelDimensions) => void;
}) {
  const [unit, setUnit] = useState<Unit>("in");

  const presetMatch = LABEL_PRESETS.find((p) => dimsApproxEqual(p.dims, value));

  // Display values in the chosen unit while always storing canonical mm.
  const displayW = unit === "mm" ? fmtMm(value.widthMm) : fmtIn(value.widthMm);
  const displayH = unit === "mm" ? fmtMm(value.heightMm) : fmtIn(value.heightMm);

  const updateFromInput = (which: "w" | "h", raw: string) => {
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    const mm = unit === "mm" ? n : inchToMm(n);
    if (which === "w") onChange({ ...value, widthMm: mm });
    else onChange({ ...value, heightMm: mm });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg glossy-brand flex items-center justify-center shrink-0">
          <Tag className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground">Label sticker size</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Must match your printer driver's <strong>Printing Preferences → Size</strong>{" "}
            exactly. Switch to the same unit your driver shows (mm or inch) and copy
            the numbers across — that's what stops the barcode from drifting onto the
            next sticker.
          </div>
        </div>
        <Badge variant="outline" className="border-primary/40 text-primary whitespace-nowrap">
          {fmtIn(value.widthMm)} × {fmtIn(value.heightMm)} in
        </Badge>
      </div>

      {/* Unit toggle */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Units:</span>
        <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setUnit("in")}
            className={
              "px-3 py-1 font-semibold " +
              (unit === "in"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-foreground hover:bg-muted")
            }
          >
            inch
          </button>
          <button
            type="button"
            onClick={() => setUnit("mm")}
            className={
              "px-3 py-1 font-semibold border-l border-border " +
              (unit === "mm"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-foreground hover:bg-muted")
            }
          >
            mm
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <Select
          value={presetMatch?.label ?? "__custom__"}
          onValueChange={(v) => {
            if (v === "__custom__") return;
            const p = LABEL_PRESETS.find((x) => x.label === v);
            if (p) {
              onChange(p.dims);
              onSave(p.dims);
            }
          }}
        >
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="Pick a preset" />
          </SelectTrigger>
          <SelectContent>
            {LABEL_PRESETS.map((p) => (
              <SelectItem key={p.label} value={p.label}>
                {p.label}
              </SelectItem>
            ))}
            {!presetMatch && <SelectItem value="__custom__">Custom</SelectItem>}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Input
            type="number"
            step={unit === "mm" ? "0.1" : "0.01"}
            min={unit === "mm" ? 10 : 0.4}
            max={unit === "mm" ? 250 : 10}
            value={displayW}
            onChange={(e) => updateFromInput("w", e.target.value)}
            className="w-24 bg-background"
          />
          <span className="text-xs text-muted-foreground">W {unit}</span>
        </div>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            step={unit === "mm" ? "0.1" : "0.01"}
            min={unit === "mm" ? 10 : 0.4}
            max={unit === "mm" ? 250 : 10}
            value={displayH}
            onChange={(e) => updateFromInput("h", e.target.value)}
            className="w-24 bg-background"
          />
          <span className="text-xs text-muted-foreground">H {unit}</span>
        </div>
        <Button onClick={() => onSave(value)} className="font-semibold">
          Save size
        </Button>
      </div>

      <div className="mt-3 grid gap-1 text-[11px] text-muted-foreground">
        <div>
          <span className="font-semibold text-foreground">Equivalents:</span>{" "}
          {fmtMm(value.widthMm)} × {fmtMm(value.heightMm)} mm &nbsp;•&nbsp;{" "}
          {fmtIn(value.widthMm)} × {fmtIn(value.heightMm)} in
        </div>
        <div>
          Tip: in <em>ZDesigner GK888t (EPL) → Printing Preferences → Options</em>, set
          Stocks to <strong>User defined</strong>, Paper Format to{" "}
          <strong>inch</strong>, Width <strong>3.20</strong>, Height{" "}
          <strong>1.10</strong>, all Unprintable Area = 0, Portrait. Then pick the
          matching preset above.
        </div>
      </div>
    </div>
  );
}

const ROLES = [
  {
    role: "receipt" as const,
    title: "Receipt Printer",
    description: "80mm thermal slip — used for sales receipts and customer invoices.",
    icon: Receipt,
  },
  {
    role: "barcode" as const,
    title: "Barcode / Label Printer",
    description: "Sticker labels (Zebra GK888t etc) — used for product and size barcodes.",
    icon: Tag,
  },
];

export default function PrintersSettings() {
  const { toast } = useToast();
  const [version, setVersion] = useState(0); // bump to re-read localStorage / re-query QZ

  // Live QZ Tray status — updates whenever the websocket opens, closes, or errors.
  const [qzStatus, setQzStatus] = useState<QzStatus>("idle");
  const [qzError, setQzError] = useState<string | null>(null);
  useEffect(() => {
    const unsub = subscribeQzStatus((s, err) => {
      setQzStatus(s);
      setQzError(err);
    });
    // Kick off an initial connection attempt so the banner reflects reality
    // immediately when the user lands on this page.
    void connectQz().catch(() => {
      /* error already surfaced via subscribeQzStatus */
    });
    return unsub;
  }, []);

  const {
    data: bridge,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["printers", version, qzStatus],
    queryFn: fetchPrinters,
    retry: false,
    staleTime: 15_000,
  });

  const [forceDialog, setForceDialog] = useState(false);
  const [labelDims, setLabelDims] = useState<LabelDimensions>(DEFAULT_LABEL_DIMENSIONS);
  useEffect(() => {
    setForceDialog(isBrowserDialogForced());
    setLabelDims(getLabelDimensions());
  }, []);

  const handleSaveLabelSize = (next: LabelDimensions) => {
    setLabelDimensions(next);
    setLabelDims(getLabelDimensions());
    toast({
      title: "Label size saved",
      description: `Each sticker is now ${next.widthMm} × ${next.heightMm} mm.`,
    });
  };

  const handleAssign = (role: "receipt" | "barcode", value: string) => {
    setAssignedPrinter(role, value === "__none__" ? null : value);
    setVersion((v) => v + 1);
    toast({
      title: value === "__none__" ? "Printer cleared" : `Assigned ${value}`,
      description: `Used for ${role === "receipt" ? "receipts & invoices" : "barcode labels"}.`,
    });
  };

  const handleToggleForce = (next: boolean) => {
    setForceBrowserDialog(next);
    setForceDialog(next);
    setVersion((v) => v + 1);
  };

  const handleConnect = async () => {
    try {
      await connectQz();
      await refetch();
      toast({ title: "Connected to QZ Tray", description: "Printer list refreshed." });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not reach QZ Tray",
        description: err?.message || "Make sure QZ Tray is installed and running.",
      });
    }
  };

  const handleDisconnect = async () => {
    await disconnectQz();
    setVersion((v) => v + 1);
  };

  const handleTestReceipt = async () => {
    const sample = {
      id: 999999,
      items: [
        {
          productId: 0,
          variantId: null as number | null,
          productName: "Test Item — Slim Fit Tee",
          barcode: "TEST-1234",
          price: 1499,
          quantity: 1,
          subtotal: 1499,
          size: "M" as string | null,
        },
      ],
      totalAmount: 1499,
      cashierId: 0,
      cashierName: "Printer Test",
      customerName: "Test Customer",
      createdAt: new Date().toISOString(),
    };
    const pdf = renderReceiptPdf(sample as any);
    const result = await silentPrintPdf("receipt", pdf, { jobName: "test_receipt" });
    if (result.ok) {
      toast({ title: "Test receipt sent", description: "Check your receipt printer." });
    } else {
      toast({
        variant: "destructive",
        title: "Could not silent-print",
        description: result.reason || "See console for details.",
      });
    }
  };

  const handleTestBarcode = async () => {
    try {
      const dims = getLabelDimensions();
      const pdf = await renderBarcodeLabelsPdf(
        [
          {
            name: "Test Product",
            title: "Test SKU",
            price: 1499,
            barcode: "TEST-1234",
            size: "L",
          },
        ],
        1,
      );
      const result = await silentPrintPdf("barcode", pdf, {
        jobName: "test_label",
        sizeMm: { width: dims.widthMm, height: dims.heightMm },
      });
      if (result.ok) {
        toast({ title: "Test label sent", description: "Check your label printer." });
      } else {
        toast({
          variant: "destructive",
          title: "Could not silent-print",
          description: result.reason || "See console for details.",
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to render label",
        description: err?.message || "Unknown error",
      });
    }
  };

  const printers = bridge?.printers ?? [];
  const bridgeAvailable = bridge?.available ?? false;
  const isConnected = qzStatus === "connected";
  const isConnecting = qzStatus === "connecting";

  return (
    <div className="flex flex-col h-full bg-background p-8 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Printer className="h-7 w-7 text-primary" />
            Printer Setup
          </h2>
          <p className="text-muted-foreground mt-1">
            Pick which physical printer handles receipts and which handles barcode labels.
            Once assigned, prints go directly to that printer — no browser dialog.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching || isConnecting}
          className="font-semibold"
        >
          {isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh printer list
        </Button>
      </div>

      {/* QZ Tray connection status */}
      <div
        className={`flex items-start gap-3 p-4 rounded-lg border ${
          isConnected
            ? "border-emerald-500/30 bg-emerald-500/5"
            : isConnecting
            ? "border-blue-500/30 bg-blue-500/5"
            : "border-amber-500/30 bg-amber-500/5"
        }`}
      >
        {isConnected ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
        ) : isConnecting ? (
          <Loader2 className="h-5 w-5 text-blue-500 mt-0.5 shrink-0 animate-spin" />
        ) : (
          <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
        )}
        <div className="flex-1 text-sm">
          {isConnecting || isLoading ? (
            <div>
              <div className="font-semibold text-foreground">Connecting to QZ Tray…</div>
              <div className="text-muted-foreground mt-0.5">
                Talking to wss://localhost:8181 — accept the QZ Tray prompt if you see one.
              </div>
            </div>
          ) : isConnected && bridgeAvailable ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold text-foreground">QZ Tray Connected</div>
                <div className="text-muted-foreground mt-0.5">
                  {printers.length} installed printer{printers.length === 1 ? "" : "s"} detected.
                  Assign one to each role below.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDisconnect()}
                className="text-xs"
              >
                <Plug className="mr-1.5 h-3.5 w-3.5" />
                Disconnect
              </Button>
            </div>
          ) : (
            <div>
              <div className="font-semibold text-foreground flex items-center gap-2">
                QZ Tray Not Connected
                <Badge variant="outline" className="border-amber-500/40 text-amber-500 text-[10px]">
                  Silent printing offline
                </Badge>
              </div>
              <div className="text-muted-foreground mt-1 space-y-2">
                {qzError && (
                  <p className="text-xs font-mono bg-background border border-border rounded p-2">
                    {qzError}
                  </p>
                )}
                <div className="rounded-md border border-amber-500/40 bg-background p-3 text-xs space-y-2">
                  <div className="font-semibold text-foreground">To enable true silent printing:</div>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>
                      Download QZ Tray (free) from{" "}
                      <a
                        href="https://qz.io/download/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        qz.io/download
                      </a>{" "}
                      and install it on this Windows PC.
                    </li>
                    <li>Open QZ Tray — its icon should appear in the system tray near the clock.</li>
                    <li>Plug in your Zebra and thermal receipt printer; install their drivers normally.</li>
                    <li>Click <strong>Connect to QZ Tray</strong> below. The first time, click <strong>Allow</strong> (and tick "Remember") on the QZ Tray prompt.</li>
                  </ol>
                </div>
                <Button
                  onClick={() => void handleConnect()}
                  className="font-semibold"
                  disabled={isConnecting}
                >
                  <PlugZap className="mr-2 h-4 w-4" />
                  {isConnecting ? "Connecting…" : "Connect to QZ Tray"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Per-role assignment */}
      <div className="grid gap-4 md:grid-cols-2">
        {ROLES.map((cfg) => {
          const Icon = cfg.icon;
          const assigned = getAssignedPrinter(cfg.role);
          const stillExists = !assigned || printers.some((p) => p.name === assigned);
          return (
            <div
              key={cfg.role}
              className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg glossy-brand flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground">{cfg.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {cfg.description}
                  </div>
                </div>
                {assigned && stillExists && isConnected && (
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                    Active
                  </Badge>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Assigned printer
                </label>
                <div className="flex gap-2">
                  <Select
                    value={assigned ?? "__none__"}
                    onValueChange={(v) => handleAssign(cfg.role, v)}
                    disabled={!bridgeAvailable && printers.length === 0}
                  >
                    <SelectTrigger className="bg-background flex-1">
                      <SelectValue placeholder="Pick a printer…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <span className="text-muted-foreground">— None (use browser dialog) —</span>
                      </SelectItem>
                      {printers.map((p) => (
                        <SelectItem key={p.name} value={p.name}>
                          {p.name}
                          {p.isDefault ? " (system default)" : ""}
                        </SelectItem>
                      ))}
                      {assigned && !stillExists && (
                        <SelectItem value={assigned}>
                          <span className="text-amber-500">{assigned} (offline)</span>
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {assigned && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleAssign(cfg.role, "__none__")}
                      title="Clear assignment"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {assigned && !stillExists && (
                  <p className="text-xs text-amber-500 mt-2">
                    This printer was previously assigned but is no longer detected. Plug it
                    in or pick another one.
                  </p>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={cfg.role === "receipt" ? handleTestReceipt : handleTestBarcode}
                disabled={!assigned || !isConnected}
                className="w-full"
              >
                <Printer className="mr-2 h-4 w-4" />
                Send test print
              </Button>
            </div>
          );
        })}
      </div>

      {/* Label dimensions */}
      <LabelSizeCard value={labelDims} onSave={handleSaveLabelSize} onChange={setLabelDims} />

      {/* Force-dialog override */}
      <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
        <div className="flex-1">
          <div className="font-semibold text-sm">Always show the browser print dialog</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Override silent printing for everyone on this machine. Useful if you want to
            change paper size or pick a different printer per job.
          </div>
        </div>
        <Switch checked={forceDialog} onCheckedChange={handleToggleForce} />
      </div>
    </div>
  );
}
