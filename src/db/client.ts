import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { serverEnv } from "@/lib/env.server";

// Server-only. Uses the Supabase pooler connection; `prepare: false` is required by the
// transaction pooler (PgBouncer) and harmless on the session pooler.
const globalForDb = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };

const client =
  globalForDb.__pg ??
  postgres(serverEnv.DATABASE_URL, {
    ssl: "require",
    prepare: false,
    max: 10,
    connect_timeout: 15,
  });

if (import.meta.env.DEV) globalForDb.__pg = client;

export const db = drizzle(client, { schema });
export { schema };
