import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireUser } from "./context";
import type { Customer } from "@/lib/invoice-math";

const customerInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name is required").max(200),
  vatNumber: z.string().trim().max(30).default(""),
  crNumber: z.string().trim().max(30).default(""),
  address: z.string().trim().max(1000).default(""),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(50).default(""),
  notes: z.string().max(2000).default(""),
});
export type CustomerInput = z.infer<typeof customerInput>;

const toCustomer = (r: typeof schema.customers.$inferSelect): Customer => ({
  id: r.id,
  name: r.name,
  vatNumber: r.vatNumber,
  crNumber: r.crNumber,
  address: r.address,
  email: r.email,
  phone: r.phone,
  notes: r.notes,
});

export const listCustomers = createServerFn({ method: "GET" }).handler(async () => {
  const { orgId } = await requireUser();
  const rows = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.orgId, orgId))
    .orderBy(asc(schema.customers.name));
  return rows.map(toCustomer);
});

export const saveCustomer = createServerFn({ method: "POST" })
  .inputValidator(customerInput)
  .handler(async ({ data }) => {
    const { orgId } = await requireUser();
    const { id, ...fields } = data;
    if (id) {
      const [row] = await db
        .update(schema.customers)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(schema.customers.id, id), eq(schema.customers.orgId, orgId)))
        .returning();
      if (!row) throw new Error("Customer not found");
      return toCustomer(row);
    }
    const [row] = await db
      .insert(schema.customers)
      .values({ ...fields, orgId })
      .returning();
    return toCustomer(row);
  });

export const deleteCustomer = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { orgId } = await requireUser();
    await db
      .delete(schema.customers)
      .where(and(eq(schema.customers.id, data.id), eq(schema.customers.orgId, orgId)));
    return { ok: true as const };
  });
