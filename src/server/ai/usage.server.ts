import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { riyadhTodayISO } from "@/lib/invoice-math";
import { serverEnv } from "@/lib/env.server";

export type AiKind = "document" | "assistant";

const limitFor = (kind: AiKind) =>
  kind === "document" ? serverEnv.AI_DAILY_DOCUMENT_LIMIT : serverEnv.AI_DAILY_ASSISTANT_LIMIT;

export class AiLimitReachedError extends Error {
  constructor(kind: AiKind, limit: number) {
    super(
      kind === "document"
        ? `Your company has used today's ${limit} AI document reads. The limit resets at midnight Saudi time.`
        : `Your company has asked the assistant ${limit} questions today. The limit resets at midnight Saudi time.`,
    );
  }
}

/**
 * Takes one unit of today's allowance, or throws AiLimitReachedError. A single upsert, so
 * concurrent requests can't both take the last unit. Returns a function that gives the unit back.
 */
export async function reserveAiCall(orgId: string, kind: AiKind): Promise<() => Promise<void>> {
  const day = riyadhTodayISO();
  const limit = limitFor(kind);
  const t = schema.aiUsage;
  const rows = await db
    .insert(t)
    .values({ orgId, day, kind, count: 1 })
    .onConflictDoUpdate({
      target: [t.orgId, t.day, t.kind],
      set: { count: sql`${t.count} + 1` },
      setWhere: sql`${t.count} < ${limit}`,
    })
    .returning({ count: t.count });
  if (rows.length === 0) throw new AiLimitReachedError(kind, limit);
  return async () => {
    await db
      .update(t)
      .set({ count: sql`greatest(${t.count} - 1, 0)` })
      .where(and(eq(t.orgId, orgId), eq(t.day, day), eq(t.kind, kind)));
  };
}
