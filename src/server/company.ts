import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireUser } from "./context";
import type { Company } from "@/lib/invoice-math";

const companyInput = z.object({
  name: z.string().trim().min(1, "Company name is required").max(200),
  logoUrl: z.string().trim().max(2000).default(""),
  vatNumber: z.string().trim().max(30).default(""),
  crNumber: z.string().trim().max(30).default(""),
  address: z.string().trim().max(1000).default(""),
  bank: z.string().trim().max(1000).default(""),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(50).default(""),
  website: z.string().trim().max(500).default(""),
  footer: z.string().trim().max(2000).default(""),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((s) => s.toUpperCase()),
  vatRate: z.number().min(0).max(100),
});

const toCompany = (o: typeof schema.organizations.$inferSelect): Company => ({
  name: o.name,
  logoUrl: o.logoUrl,
  vatNumber: o.vatNumber,
  crNumber: o.crNumber,
  address: o.address,
  bank: o.bank,
  email: o.email,
  phone: o.phone,
  website: o.website,
  footer: o.footer,
  currency: o.currency,
  vatRate: o.vatRate,
});

export const getCompany = createServerFn({ method: "GET" }).handler(async () => {
  const { orgId } = await requireUser();
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, orgId),
  });
  if (!org) throw new Error("Organisation not found");
  return toCompany(org);
});

export const updateCompany = createServerFn({ method: "POST" })
  .inputValidator(companyInput)
  .handler(async ({ data }) => {
    const { orgId } = await requireUser();
    const [org] = await db
      .update(schema.organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.organizations.id, orgId))
      .returning();
    return toCompany(org);
  });
