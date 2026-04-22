import "./load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString =
  process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "SUPABASE_DATABASE_URL or DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isSupabase = /supabase\.com|pooler\.supabase/.test(connectionString);

export const pool = new Pool({
  connectionString,
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  // Supabase pooler drops idle TCP connections aggressively. Without keepalive
  // the first query after a few minutes silently hangs until the OS times out
  // (~20s) — the user sees "disconnected" / 500 errors.
  keepAlive: true,
  // Fail fast instead of hanging the request for 20+ seconds.
  connectionTimeoutMillis: 10_000,
  // Recycle idle connections so we don't hand out stale sockets.
  idleTimeoutMillis: 30_000,
  max: 10,
});

pool.on("error", (err) => {
  console.error("[db] pool error:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
