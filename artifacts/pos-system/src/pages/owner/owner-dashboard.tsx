import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ownerApi,
  type LicensedClient,
  type OwnerUser,
} from "@/lib/owner-api";
import { ownerPath } from "@/config/owner-portal";
import {
  ShieldCheck,
  LogOut,
  Plus,
  Power,
  PowerOff,
  Pencil,
  Trash2,
  Loader2,
  Calendar,
  KeyRound,
  Users,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// ---------- Helpers ----------
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // YYYY-MM-DDTHH:MM in LOCAL time, suitable for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type ComputedStatus = "active" | "disabled" | "not_started" | "expired";

function computeStatus(c: LicensedClient): ComputedStatus {
  if (!c.isEnabled) return "disabled";
  const now = Date.now();
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return "not_started";
  if (new Date(c.expiresAt).getTime() <= now) return "expired";
  return "active";
}

function statusLabel(s: ComputedStatus): { text: string; cls: string } {
  switch (s) {
    case "active":
      return { text: "Active", cls: "bg-green-500/20 text-green-300 border-green-500/40" };
    case "disabled":
      return { text: "Disabled", cls: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40" };
    case "not_started":
      return { text: "Scheduled", cls: "bg-blue-500/20 text-blue-300 border-blue-500/40" };
    case "expired":
      return { text: "Expired", cls: "bg-red-500/20 text-red-300 border-red-500/40" };
  }
}

// ---------- Edit / Create dialog ----------
interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: LicensedClient | null; // null = create mode
}

function EditClientDialog({ open, onOpenChange, client }: EditDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEdit = client !== null;

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (client) {
      setName(client.name);
      setContact(client.contact ?? "");
      setNotes(client.notes ?? "");
      setLicenseKey(client.licenseKey);
      setStartsAt(isoToLocalInput(client.startsAt));
      setExpiresAt(isoToLocalInput(client.expiresAt));
      setIsEnabled(client.isEnabled);
    } else {
      // Sensible default: enabled, expires 30 days from now, no start date.
      const inThirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      setName("");
      setContact("");
      setNotes("");
      setLicenseKey("");
      setStartsAt("");
      setExpiresAt(isoToLocalInput(inThirtyDays.toISOString()));
      setIsEnabled(true);
    }
  }, [open, client]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        contact: contact.trim() || null,
        notes: notes.trim() || null,
        startsAt: localInputToIso(startsAt),
        expiresAt: localInputToIso(expiresAt) ?? new Date().toISOString(),
        isEnabled,
      };
      if (isEdit && client) {
        return ownerApi.updateClient(client.id, payload);
      }
      return ownerApi.createClient({
        ...payload,
        licenseKey: licenseKey.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-clients"] });
      onOpenChange(false);
      toast({
        title: isEdit ? "Client updated" : "Client added",
        description: isEdit
          ? "License details saved successfully."
          : "New licensed client created.",
      });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err?.message ?? "Something went wrong",
      });
    },
  });

  const canSubmit = name.trim().length > 0 && expiresAt.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit client" : "Add new client"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update license details. Changes apply on the POS within ~1 minute."
              : "Create a new licensed POS deployment."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="client-name">Client name</Label>
            <Input
              id="client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="De Luxury Boutique"
              data-testid="input-client-name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="client-contact">Contact</Label>
              <Input
                id="client-contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="+92-300-1234567"
                data-testid="input-client-contact"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-licensekey">License key</Label>
              <Input
                id="client-licensekey"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder={isEdit ? "" : "Auto-generated"}
                disabled={isEdit}
                data-testid="input-client-licensekey"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="client-starts">Start date (optional)</Label>
              <Input
                id="client-starts"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                data-testid="input-client-startsat"
              />
              <p className="text-[11px] text-muted-foreground">
                If set in the future, POS stays locked until this moment.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-expires">End date</Label>
              <Input
                id="client-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                data-testid="input-client-expiresat"
              />
              <p className="text-[11px] text-muted-foreground">
                POS auto-disables after this moment.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-notes">Notes (optional)</Label>
            <Textarea
              id="client-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any internal notes…"
              data-testid="input-client-notes"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="client-enabled" className="text-sm font-medium">
                Manual master switch
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Off = POS instantly locked, regardless of dates.
              </p>
            </div>
            <Switch
              id="client-enabled"
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
              data-testid="switch-client-enabled"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            data-testid="button-save-client"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : isEdit ? (
              "Save changes"
            ) : (
              "Add client"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Page ----------
export default function OwnerDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [owner, setOwner] = useState<OwnerUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [editTarget, setEditTarget] = useState<LicensedClient | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LicensedClient | null>(null);

  // Owner session check
  useEffect(() => {
    let cancelled = false;
    ownerApi
      .me()
      .then((r) => { if (!cancelled) setOwner(r.owner); })
      .catch(() => { if (!cancelled) setLocation(ownerPath("/login")); })
      .finally(() => { if (!cancelled) setAuthChecked(true); });
    return () => { cancelled = true; };
  }, [setLocation]);

  const { data: clients, isLoading, error } = useQuery({
    queryKey: ["owner-clients"],
    queryFn: () => ownerApi.listClients(),
    enabled: !!owner,
    refetchInterval: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: number; isEnabled: boolean }) =>
      ownerApi.updateClient(id, { isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-clients"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Update failed", description: err?.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ownerApi.deleteClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-clients"] });
      toast({ title: "Client deleted" });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Delete failed", description: err?.message });
    },
  });

  const handleLogout = async () => {
    try {
      await ownerApi.logout();
    } catch { /* ignore */ }
    setLocation(ownerPath("/login"));
  };

  const stats = useMemo(() => {
    const list = clients ?? [];
    let active = 0, disabled = 0, expired = 0, scheduled = 0;
    for (const c of list) {
      const s = computeStatus(c);
      if (s === "active") active++;
      else if (s === "disabled") disabled++;
      else if (s === "expired") expired++;
      else if (s === "not_started") scheduled++;
    }
    return { total: list.length, active, disabled, expired, scheduled };
  }, [clients]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!owner) return null; // Redirecting

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center ring-1 ring-white/10">
              <ShieldCheck className="h-5 w-5 text-[#f63d25]" />
            </div>
            <div>
              <div className="text-base font-bold tracking-tight">Owner Console</div>
              <div className="text-xs text-muted-foreground">
                Signed in as <span className="font-medium">{owner.email}</span>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-owner-logout">
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats.total} icon={Users} />
          <StatCard label="Active" value={stats.active} icon={Power} accent="text-green-400" />
          <StatCard label="Scheduled" value={stats.scheduled} icon={Calendar} accent="text-blue-400" />
          <StatCard label="Expired" value={stats.expired} icon={AlertCircle} accent="text-red-400" />
          <StatCard label="Disabled" value={stats.disabled} icon={PowerOff} accent="text-zinc-400" />
        </div>

        {/* Clients */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Licensed clients</CardTitle>
              <CardDescription>
                Each row is one POS deployment. Toggle the switch to instantly enable or disable it.
              </CardDescription>
            </div>
            <Button onClick={() => { setEditTarget(null); setEditOpen(true); }} data-testid="button-add-client">
              <Plus className="h-4 w-4 mr-2" />
              Add client
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="py-12 text-center text-sm text-red-400">
                Failed to load clients. Try refreshing.
              </div>
            ) : (clients ?? []).length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No clients yet. Click <span className="font-semibold">Add client</span> to create one.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left font-medium py-3 px-3">Client</th>
                      <th className="text-left font-medium py-3 px-3">License</th>
                      <th className="text-left font-medium py-3 px-3">Window</th>
                      <th className="text-left font-medium py-3 px-3">Status</th>
                      <th className="text-center font-medium py-3 px-3">On / Off</th>
                      <th className="text-right font-medium py-3 px-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients!.map((c) => {
                      const s = computeStatus(c);
                      const lbl = statusLabel(s);
                      return (
                        <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-3 px-3">
                            <div className="font-medium">{c.name}</div>
                            {c.contact && (
                              <div className="text-xs text-muted-foreground mt-0.5">{c.contact}</div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="inline-flex items-center gap-1.5 text-xs font-mono bg-muted/50 px-2 py-1 rounded">
                              <KeyRound className="h-3 w-3" />
                              {c.licenseKey}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-xs text-muted-foreground">
                            <div>
                              <span className="text-foreground/70">Starts:</span>{" "}
                              {c.startsAt ? formatDate(c.startsAt) : <em>immediately</em>}
                            </div>
                            <div className="mt-0.5">
                              <span className="text-foreground/70">Ends:</span> {formatDate(c.expiresAt)}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <Badge variant="outline" className={lbl.cls} data-testid={`badge-status-${c.id}`}>
                              {lbl.text}
                            </Badge>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <Switch
                              checked={c.isEnabled}
                              disabled={toggleMutation.isPending}
                              onCheckedChange={(v) =>
                                toggleMutation.mutate({ id: c.id, isEnabled: v })
                              }
                              data-testid={`switch-toggle-${c.id}`}
                            />
                          </td>
                          <td className="py-3 px-3 text-right space-x-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => { setEditTarget(c); setEditOpen(true); }}
                              data-testid={`button-edit-${c.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-400 hover:text-red-300"
                              onClick={() => setDeleteTarget(c)}
                              data-testid={`button-delete-${c.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit / create dialog */}
      <EditClientDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditTarget(null); }}
        client={editTarget}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete client?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{deleteTarget?.name}</strong> and its license. The
              POS deployment using this license will lock immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- Stat card ----------
function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="py-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
          <Icon className={`h-4 w-4 ${accent ?? "text-muted-foreground"}`} />
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
          <div className="text-xl font-bold leading-tight">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
