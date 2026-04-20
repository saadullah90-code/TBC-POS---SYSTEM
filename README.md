# BranX* Retail POS

Plug-and-play POS, inventory, and barcode system. React + Vite + Express + Postgres.

## Quick Start (Windows / macOS / Linux)

You need: **Node.js 20+** and a Postgres database (Supabase / Neon / local).

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
#    Windows PowerShell:  Copy-Item .env.example .env
#    macOS / Linux:        cp .env.example .env
# Then edit .env and fill in DATABASE_URL and SESSION_SECRET.

# 3. Create database tables
npm run db:push

# 4. Seed demo users + sample products
npm run db:seed

# 5. Run the app (API + Web together)
npm run dev
```

Open the web app at <http://localhost:5173>. The API runs on <http://localhost:3001>.

## Demo Logins

| Role      | Email                  | Password     |
|-----------|------------------------|--------------|
| Admin     | admin@store.com        | admin123     |
| Cashier   | cashier@store.com      | cashier123   |
| Inventory | inventory@store.com    | inventory123 |

## Production Build

```bash
npm run build
npm run start
```

## Useful Scripts

| Command             | What it does                                      |
|---------------------|---------------------------------------------------|
| `npm run dev`       | Run API + web together (live reload)              |
| `npm run db:push`   | Apply schema changes to your database             |
| `npm run db:seed`   | Insert demo users and products                    |
| `npm run build`     | Type-check + build all workspaces                 |
| `npm run typecheck` | Type-check only                                   |

## Project Layout

```
artifacts/
  api-server/   Express + Drizzle backend
  pos-system/   React + Vite frontend
lib/
  db/           Shared Drizzle schema + Postgres client
  api-spec/     OpenAPI types
  api-zod/      Zod validation schemas
  api-client-react/  Generated React Query hooks
scripts/        Database seed script
```
