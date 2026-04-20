# BranX* Retail POS

Plug-and-play POS, inventory, and barcode system. React + Vite + Express + Postgres.

## Quick Start (Windows / macOS / Linux)

You need: **Node.js 20+** and a Postgres database (Supabase / Neon / local).

> **IMPORTANT:** In any new folder you must run `npm install` **first**, before
> any other command. Without it you'll see errors like
> `'drizzle-kit' is not recognized` or `'tsx' is not recognized` —
> that just means the dependencies haven't been downloaded yet.

```bash
# 1. Install dependencies (DO THIS FIRST — every fresh copy of the project)
npm install

# 2. Create your .env file
#    Windows PowerShell:  Copy-Item .env.example .env
#    macOS / Linux:        cp .env.example .env
# Then edit .env and fill in DATABASE_URL and SESSION_SECRET.

# 3. One-shot DB setup (creates tables + seeds demo users)
npm run db:push
npm run db:seed

# 4. Run the app (API + Web together)
npm run dev
```

After step 2 you can also do steps 1+3 together with a single command:

```bash
npm run setup        # = npm install && npm run db:push && npm run db:seed
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
