import "./src/load-env";
import { defineConfig } from "drizzle-kit";

const url = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "SUPABASE_DATABASE_URL or DATABASE_URL must be set, ensure the database is provisioned",
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url,
    ssl: /supabase\.com|pooler\.supabase/.test(url)
      ? { rejectUnauthorized: false }
      : undefined,
  },
});
