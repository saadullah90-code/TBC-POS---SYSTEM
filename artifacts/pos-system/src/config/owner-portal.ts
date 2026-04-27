/**
 * The hidden URL prefix for the super-admin "Owner Console".
 *
 * Anyone visiting `/owner` will see a 404 — the real panel only responds at
 * `/${OWNER_PORTAL_SLUG}/login` and `/${OWNER_PORTAL_SLUG}`. Same value is
 * used on the API side as `/api/${OWNER_PORTAL_SLUG}/...`.
 *
 * The default below is a deliberately unguessable string so the panel is
 * safe in dev. For production you SHOULD override it via env vars so even
 * the source code does not leak the URL:
 *
 *   Backend  (api-server):  OWNER_PORTAL_SLUG=...
 *   Frontend (pos-system):  VITE_OWNER_PORTAL_SLUG=...   (must match)
 *
 * If the two ever drift apart, the owner UI will silently 404 — both sides
 * therefore fall back to the SAME hard-coded default below.
 */
export const OWNER_PORTAL_SLUG: string =
  (import.meta.env.VITE_OWNER_PORTAL_SLUG as string | undefined) ||
  "brx-control-x9k2p7m4";

export const ownerPath = (suffix = ""): string =>
  `/${OWNER_PORTAL_SLUG}${suffix}`;
