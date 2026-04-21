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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
} from "@/lib/printer-bridge";
import { renderReceiptPdf } from "@/lib/pdf/receipt-pdf";
import { renderBarcodeLabelsPdf } from "@/lib/pdf/barcode-pdf";

const ROLES = [
  {
    role: "receipt" as const,
    title: "Receipt Printer",
    description: "80mm thermal slip — used for sales receipts after every transaction.",
    icon: Receipt,
  },
  {
    role: "barcode" as const,
    title: "Barcode / Label Printer",
    description: "50×30mm sticker labels — used for product and size barcodes.",
    icon: Tag,
  },
];

export default function PrintersSettings() {
  const { toast } = useToast();
  const [version, setVersion] = useState(0); // bump to re-read localStorage after save

  const {
    data: bridge,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["printers", version],
    queryFn: fetchPrinters,
    retry: false,
    staleTime: 30_000,
  });

  const [forceDialog, setForceDialog] = useState(false);
  useEffect(() => {
    setForceDialog(isBrowserDialogForced());
  }, []);

  const handleAssign = (role: "receipt" | "barcode", value: string) => {
    setAssignedPrinter(role, value === "__none__" ? null : value);
    setVersion((v) => v + 1);
    toast({
      title: value === "__none__" ? "Printer cleared" : `Assigned ${value}`,
      description: `Used for ${role === "receipt" ? "receipts" : "barcode labels"}.`,
    });
  };

  const handleToggleForce = (next: boolean) => {
    setForceBrowserDialog(next);
    setForceDialog(next);
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
      const result = await silentPrintPdf("barcode", pdf, { jobName: "test_label" });
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
          disabled={isFetching}
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

      {/* Bridge status */}
      <div
        className={`flex items-start gap-3 p-4 rounded-lg border ${
          bridgeAvailable
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-amber-500/30 bg-amber-500/5"
        }`}
      >
        {bridgeAvailable ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
        ) : (
          <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
        )}
        <div className="flex-1 text-sm">
          {isLoading ? (
            <div className="text-muted-foreground">Checking local print bridge…</div>
          ) : bridgeAvailable ? (
            <>
              <div className="font-semibold text-foreground">
                Local print bridge is ready ({bridge?.platform})
              </div>
              <div className="text-muted-foreground mt-0.5">
                {printers.length} installed printer{printers.length === 1 ? "" : "s"} detected.
                Assign one to each role below.
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold text-foreground">
                Local print bridge unavailable
              </div>
              <div className="text-muted-foreground mt-0.5">
                The POS API server is reachable but couldn&apos;t talk to the OS print
                spooler ({bridge?.platform || "unknown"}). Make sure you started the app
                with <code className="px-1 bg-secondary rounded">npm run dev</code> on the
                same Windows machine where your printers are installed. Receipts and
                labels will fall back to the browser print dialog until this is resolved.
              </div>
            </>
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
                {assigned && stillExists && (
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
                disabled={!assigned}
                className="w-full"
              >
                <Printer className="mr-2 h-4 w-4" />
                Send test print
              </Button>
            </div>
          );
        })}
      </div>

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
