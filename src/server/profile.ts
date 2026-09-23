import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireUser } from "./context";
import type { UserSettings } from "@/lib/invoice-math";

const settingsInput = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  language: z.enum(["en", "ar"]).optional(),
  theme: z.enum(["light", "dark"]).optional(),
  emailNotifs: z.boolean().optional(),
  smsNotifs: z.boolean().optional(),
});

const toSettings = (p: typeof schema.profiles.$inferSelect): UserSettings => ({
  fullName: p.fullName,
  email: p.email,
  language: p.language === "ar" ? "ar" : "en",
  theme: p.theme === "dark" ? "dark" : "light",
  emailNotifs: p.emailNotifs,
  smsNotifs: p.smsNotifs,
});

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { userId } = await requireUser();
  const p = await db.query.profiles.findFirst({ where: eq(schema.profiles.id, userId) });
  if (!p) throw new Error("Profile not found");
  return toSettings(p);
});

export const updateSettings = createServerFn({ method: "POST" })
  .inputValidator(settingsInput)
  .handler(async ({ data }) => {
    const { userId } = await requireUser();
    const [p] = await db
      .update(schema.profiles)
      .set(data)
      .where(eq(schema.profiles.id, userId))
      .returning();
    return toSettings(p);
  });
