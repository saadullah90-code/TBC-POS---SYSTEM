# Retail POS + Inventory + Barcode System

## Overview

A complete production-ready retail POS system built as a pnpm monorepo.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/pos-system)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Session-based (express-session + crypto/SHA-256 hashing)
- **Barcode generation**: bwip-js
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Features

- **Admin Dashboard**: Sales analytics (today/week/month), charts, top products, low-stock alerts
- **Inventory Management**: Add/edit/delete products, auto barcode generation (PROD-XXXX)
- **Barcode Printing**: bwip-js renders Code128 barcodes, printable label pages (window.print)
- **POS / Billing**: Always-focused barcode scanner input, cart management, complete sale with stock reduction, invoice printing
- **Customer Display**: Real-time cart view via localStorage sync
- **Sales History**: Paginated list with period filters, view invoices
- **User Management**: Admin can create/edit/delete users with role assignment
- **Role-based Access**: Admin, Cashier, Inventory Staff roles

## Default Users (seeded)

- Admin: admin@store.com / admin123
- Cashier: cashier@store.com / cashier123
- Inventory: inventory@store.com / inventory123

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Architecture

- `lib/api-spec/openapi.yaml` — single source of truth for API contract
- `lib/db/src/schema/` — Drizzle ORM table definitions (users, products, sales)
- `artifacts/api-server/src/routes/` — Express route handlers (auth, users, products, sales, dashboard)
- `artifacts/pos-system/src/pages/` — React pages (login, dashboard, inventory, pos, invoice, customer-display, sales, users, barcode-print)
- Session cookies for auth; `SESSION_SECRET` env var required

## Environment Variables Required

- `SESSION_SECRET` — secret for express-session
- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned by Replit)
