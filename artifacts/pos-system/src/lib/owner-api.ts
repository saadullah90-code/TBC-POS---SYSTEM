/**
 * Tiny fetch wrapper for the owner / license endpoints.
 * Lives outside `@workspace/api-client-react` (which is generated from the
 * OpenAPI spec) so the owner panel can ship without touching codegen.
 *
 * All requests use `credentials: "include"` so the express-session cookie is
 * sent, and they go through the same `/api` proxy as the rest of the POS.
 */

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
const API = `${BASE}/api`;

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  const text = await res.text();
  if (text) {
    try { json = JSON.parse(text); } catch { json = { error: text }; }
  }
  if (!res.ok) {
    const err = new Error(json?.error || `Request failed (${res.status})`);
    (err as any).status = res.status;
    (err as any).body = json;
    throw err;
  }
  return json as T;
}

// ---------- Types ----------
export interface OwnerUser {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

export interface LicensedClient {
  id: number;
  name: string;
  contact: string | null;
  notes: string | null;
  licenseKey: string;
  startsAt: string | null;
  expiresAt: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LicenseStatusValue =
  | "active"
  | "disabled"
  | "not_started"
  | "expired"
  | "no_license";

export interface LicenseStatus {
  status: LicenseStatusValue;
  active: boolean;
  message: string;
  client: {
    name: string;
    contact: string | null;
    startsAt: string | null;
    expiresAt: string;
  } | null;
}

// ---------- Owner auth ----------
export const ownerApi = {
  login: (email: string, password: string) =>
    request<{ owner: OwnerUser; message: string }>("POST", "/owner/auth/login", { email, password }),
  me: () => request<{ owner: OwnerUser }>("GET", "/owner/auth/me"),
  logout: () => request<{ message: string }>("POST", "/owner/auth/logout"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>("POST", "/owner/auth/change-password", { currentPassword, newPassword }),

  // Clients
  listClients: () => request<LicensedClient[]>("GET", "/owner/clients"),
  createClient: (data: {
    name: string;
    contact?: string | null;
    notes?: string | null;
    licenseKey?: string;
    startsAt?: string | null;
    expiresAt: string;
    isEnabled?: boolean;
  }) => request<LicensedClient>("POST", "/owner/clients", data),
  updateClient: (
    id: number,
    data: Partial<{
      name: string;
      contact: string | null;
      notes: string | null;
      startsAt: string | null;
      expiresAt: string;
      isEnabled: boolean;
    }>,
  ) => request<LicensedClient>("PATCH", `/owner/clients/${id}`, data),
  deleteClient: (id: number) => request<void>("DELETE", `/owner/clients/${id}`),
};

// ---------- Public license status ----------
export function fetchLicenseStatus(): Promise<LicenseStatus> {
  return request<LicenseStatus>("GET", "/license/status");
}
