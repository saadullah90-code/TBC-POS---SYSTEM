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
- Admin: `admin@store.com` / `admin123`
- Cashier: `cashier@store.com` / `cashier123`
- Inventory: `inventory@store.com` / `inventory123`

## Environment
```
SUPABASE_DATABASE_URL=postgresql://...   # Supabase pooler URL
SESSION_SECRET=<random 32+ char string>
```
On Replit these are set via Secrets. On a local Windows machine they live in `.env` at project root (already gitignored).

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
