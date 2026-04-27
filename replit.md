# BranX* Retail POS — De Luxury Boutique

## Overview
Production-ready POS + Inventory + Barcode label system for a single-store boutique. Web app runs on the cash counter PC; receipt printing (80mm thermal) and barcode label printing (Zebra GK888t) happen silently via QZ Tray — no browser print dialog.

## Stack
- **Monorepo**: pnpm workspaces (npm-compatible — both work)
- **Frontend**: React 18 + Vite 7 + TailwindCSS + Radix UI (`artifacts/pos-system`)
- **API**: Express 5 + esbuild bundle (`artifacts/api-server`)
- **DB**: PostgreSQL (Supabase) + Drizzle ORM
- **Auth**: Session cookies + crypto.scrypt password hashing
- **Barcode rendering**: bwip-js (Code128)
- **PDF**: jsPDF (receipts + labels)
- **Silent printing**: QZ Tray over WebSocket (`@/lib/qz-bridge.ts`)

## Default Users (seeded)
- Admin:    `admin@store.com`     / `admin123`     (demo seed only — rotate before going live)
- Cashier:  `cashier@store.com`   / `cashier123`   (demo seed only — rotate before going live)
- Inventory:`inventory@store.com` / `inventory123` (demo seed only — rotate before going live)
- Real production admin credentials are stored in Supabase only and are
  NOT documented in this file. Ask the project owner if you need them.

## SaaS Owner Console (super-admin)
A separate "owner" panel sits inside the same `pos-system` artifact, sharing
the same Express api-server + Supabase DB. Used by the platform owner to
license individual POS deployments.

- **Hidden URL slug** — the owner panel is NOT mounted at `/owner` (visiting
  `/owner` returns 404). Real path is `/${OWNER_PORTAL_SLUG}/login` →
  `/${OWNER_PORTAL_SLUG}` (clients dashboard). API mirrors at
  `/api/${OWNER_PORTAL_SLUG}/*`.
- Default slug (dev): `brx-control-x9k2p7m4`
- **In production** override via env vars (must match):
  - Backend:  `OWNER_PORTAL_SLUG=...`
  - Frontend: `VITE_OWNER_PORTAL_SLUG=...`
- Source of truth: `artifacts/pos-system/src/config/owner-portal.ts` (frontend)
  and `artifacts/api-server/src/routes/index.ts` (backend mount).
- **Hidden owner-gate on the staff login page**: a low-contrast `?` icon at
  the bottom-left of `/login` (`pages/auth/login.tsx`) opens a tiny
  "Who are you?" dialog. Typing the correct passphrase and pressing Enter
  navigates to `/${OWNER_PORTAL_SLUG}/login`. Any other input closes the
  dialog silently (no error feedback) so the feature looks like a stray
  help button. The passphrase string lives ONLY in source as the constant
  `OWNER_GATE_PASSPHRASE` at the top of that file (kept out of this doc
  on purpose; treat it as UX obscurity, not a security boundary).
- Owner credentials live in Supabase (`owner_users` table) and are NOT
  documented here. Ask the project owner if you need them.
- Tables: `owner_users`, `licensed_clients` (defined in `lib/db/src/schema/owner.ts`,
  matching pre-existing Supabase columns; both have `serial` PKs — DO NOT change to varchar)
- License rules (computed in `routes/license.ts` and mirrored in `pages/owner/owner-dashboard.tsx`):
  - `active` = `is_enabled` AND (`starts_at` IS NULL OR `starts_at` ≤ NOW) AND `expires_at` > NOW
  - else `disabled` / `not_started` / `expired`
- POS frontend polls `GET /api/license/status` every 60s (component `LicenseGuard`,
  mounted inside `AuthWrapper`). When inactive → blocking modal on admin / inventory
  / cashier screens with sign-out only.
- Owner session uses the SAME express-session store but a different field
  (`req.session.ownerId` vs `req.session.userId`), so the two logins do not interfere.

## Security middleware
- `artifacts/api-server/src/lib/require-session.ts` — gate applied via
  `router.use(requireSession)` to **users**, **products**, **sales**, and
  **dashboard** routers. Without a valid `req.session.userId` cookie these
  return 401 (reads + writes both protected). Public routes that bypass it:
  `/api/healthz`, `/api/auth/login`, `/api/license/status`, the hidden owner
  endpoints (which use their own `requireOwner`).
- `artifacts/api-server/src/lib/rate-limit.ts` — per-IP login throttle
  (5 fails / 15 min lockout, separate buckets for `staff` and `owner` so
  one cannot lock out the other). Applied to `POST /api/auth/login` and
  `POST /api/${OWNER_PORTAL_SLUG}/auth/login`. Returns 429 with retry hint.

## Environment
```
SUPABASE_DATABASE_URL=postgresql://...   # Supabase pooler URL
SESSION_SECRET=<random 32+ char string>

# OPTIONAL — override the hidden owner-panel URL. Defaults to
# `brx-control-x9k2p7m4` if unset. Backend + frontend MUST agree.
OWNER_PORTAL_SLUG=<unguessable-slug>
VITE_OWNER_PORTAL_SLUG=<same-unguessable-slug>
```
On Replit these are set via Secrets. On a local Windows machine they live in `.env` at project root (already gitignored). See `.env.example` at the project root for a documented template.

### Railway deploy checklist
1. In the Railway project → **Variables**, set ALL of: `SUPABASE_DATABASE_URL` (or `DATABASE_URL`), `SESSION_SECRET`, and the matching pair `OWNER_PORTAL_SLUG` + `VITE_OWNER_PORTAL_SLUG`.
2. Trigger redeploy after pushing the latest commit. Until that redeploy
   completes, the production app will still be on the old build where the
   owner panel was mounted at `/api/owner/*` — that is the source of the
   `Cannot POST /api/${OWNER_PORTAL_SLUG}/auth/login` error in the screenshot.
3. After redeploy, test: open `/login`, click the hidden `?` at bottom-left,
   type the owner-gate passphrase (see `OWNER_GATE_PASSPHRASE` in
   `pages/auth/login.tsx`), press Enter — Owner Console login should appear.

## Key Commands
- `npm run dev` — runs API + Web together (concurrently)
- `npm run db:push` — sync schema to DB (uses Drizzle Kit)
- `npm run db:seed` — insert demo users + sample products
- `npm run typecheck` — typecheck all workspaces
- `npm run build` — build all workspaces

## Important Files
- `lib/db/src/index.ts` — pool config (keepAlive + 10s connect timeout for Supabase pooler)
- `lib/db/src/schema/` — Drizzle tables (users, products, product_variants, sales)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/pos-system/src/lib/printer-bridge.ts` — printer assignment + label dimensions in localStorage
- `artifacts/pos-system/src/lib/pdf/barcode-pdf.ts` — multi-mode label PDF (left-only / duplicate / pack-2-up)
- `artifacts/pos-system/src/lib/pdf/receipt-pdf.ts` — 80mm thermal receipt PDF (dynamic height)
- `artifacts/pos-system/src/lib/qz-bridge.ts` — QZ Tray WebSocket client
- `artifacts/pos-system/src/pages/settings/printers.tsx` — printer setup UI

## Label Printing Modes (2-up rolls)
Settings → Printers exposes these for rolls with two stickers per row:
- **Left only** — barcode on left, right stays blank
- **Same on both** — same barcode duplicated on both stickers
- **Pack different** — two different products' labels packed side-by-side (most paper-efficient)

Manual X / Y / X-Right nudges (mm or inch) compensate for printer driver centring quirks.

## Workflow (development)
1. Agent edits code on Replit
2. User commits + pushes via Replit Git pane (manual — agent cannot push)
3. On the shop's Windows PC: `git pull` then `npm run dev`
4. QZ Tray must be running on that PC for silent printing (download: https://qz.io/)

## Deployment
Use Replit's publish flow when ready. Cashier opens the deployed URL in any browser; QZ Tray on the local PC handles physical printing.

## Recent Changes
- 2026-04-22: Cleaned up project — removed 4.8MB of unused screenshots from `attached_assets/`, removed `scripts/src/hello.ts` placeholder, updated this doc.
- 2026-04-22: Added 3-mode right-column behaviour (blank / duplicate / pack) for 2-up label rolls; added X-Right manual nudge.
- 2026-04-22: DB pool now uses keepAlive + 10s connection timeout — fixes Supabase pooler dropping idle connections.
- 2026-04-21: 2-up roll support, manual X/Y nudge, settings UI for label dimensions.
