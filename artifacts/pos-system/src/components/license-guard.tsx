import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useLogout, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { fetchLicenseStatus, type LicenseStatus } from "@/lib/owner-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, LogOut } from "lucide-react";

const POLL_MS = 60_000;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusHeading(status: LicenseStatus["status"]): string {
  switch (status) {
    case "expired":
      return "Subscription Expired";
    case "disabled":
      return "Subscription Disabled";
    case "not_started":
      return "Subscription Not Active Yet";
    case "no_license":
      return "No Active License";
    default:
      return "License Issue";
  }
}

/**
 * Polls /api/license/status. When the license is not active, renders a
 * blocking full-screen modal so admin / inventory / cashier screens cannot
 * be used until the owner reactivates from the owner dashboard.
 *
 * Always rendered (even when active) — it returns null in that case — so it
 * lives quietly inside `AuthWrapper` without disturbing existing layout.
 */
export function LicenseGuard() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const logoutMutation = useLogout();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const { data } = useQuery({
    queryKey: ["license-status"],
    queryFn: fetchLicenseStatus,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: 1,
  });

  // If we cannot reach the license endpoint at all, do nothing — failing
  // open is intentional so a transient network blip never locks the store
  // out unfairly. The next successful poll will catch the real status.
  useEffect(() => {
    // no-op (placeholder for future analytics/telemetry)
  }, [data?.status]);

  if (!data || data.active) return null;

  const handleLogout = () => {
    setConfirmingLogout(true);
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
        queryClient.clear();
        setLocation("/login");
        setConfirmingLogout(false);
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-md bg-black/80"
      role="dialog"
      aria-modal="true"
      data-testid="license-blocking-modal"
    >
      <Card className="w-full max-w-md border border-red-500/30 bg-zinc-950 text-white shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-red-500/15 ring-1 ring-red-500/40 flex items-center justify-center">
            <ShieldAlert className="h-7 w-7 text-red-400" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">
            {statusHeading(data.status)}
          </CardTitle>
          <CardDescription className="text-white/65 leading-relaxed">
            {data.message}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.client && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm space-y-2">
              <div className="flex justify-between gap-4">
                <span className="text-white/50">Account</span>
                <span className="font-medium text-right">{data.client.name}</span>
              </div>
              {data.client.contact && (
                <div className="flex justify-between gap-4">
                  <span className="text-white/50">Owner contact</span>
                  <span className="font-medium text-right">{data.client.contact}</span>
                </div>
              )}
              {data.status === "not_started" && (
                <div className="flex justify-between gap-4">
                  <span className="text-white/50">Starts</span>
                  <span className="font-medium text-right">
                    {formatDate(data.client.startsAt)}
                  </span>
                </div>
              )}
              {data.status !== "not_started" && (
                <div className="flex justify-between gap-4">
                  <span className="text-white/50">Expires</span>
                  <span className="font-medium text-right">
                    {formatDate(data.client.expiresAt)}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-200/90 leading-relaxed">
            For renewal or reactivation please contact the system owner. Once
            reactivated, this screen will close automatically within a minute.
          </div>

          <Button
            variant="outline"
            className="w-full border-white/15 hover:bg-white/[0.06]"
            onClick={handleLogout}
            disabled={confirmingLogout || logoutMutation.isPending}
            data-testid="button-license-logout"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
