import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireUser } from "./context";
import type { Invoice, InvoiceItem } from "@/lib/invoice-math";

const itemSchema = z.object({
  id: z.string().optional(),
  description: z.string().max(500).default(""),
  quantity: z.number().min(0).max(1e9),
  unitPrice: z.number().min(0).max(1e11),
  discount: z.number().min(0).max(1e11),
  vatRate: z.number().min(0).max(100),
});

const invoiceInput = z.object({
  id: z.string().uuid().optional(),
  number: z.string().trim().min(1, "Invoice number is required").max(50),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid due date"),
  customerId: z.string().uuid().nullable().default(null),
  customerName: z.string().trim().min(1, "Customer name is required").max(200),
  customerVat: z.string().trim().max(30).default(""),
  customerAddress: z.string().trim().max(1000).default(""),
  currency: z.string().trim().length(3),
  status: z.enum(["draft", "unpaid", "paid", "overdue"]),
  template: z.enum(["modern", "corporate", "minimal", "arabic", "bilingual"]),
  notes: z.string().max(2000).default(""),
  items: z.array(itemSchema).min(1, "Add at least one item"),
});
export type InvoiceInput = z.infer<typeof invoiceInput>;

function toInvoice(
  row: typeof schema.invoices.$inferSelect,
  items: (typeof schema.invoiceItems.$inferSelect)[],
): Invoice {
  return {
    id: row.id,
    number: row.number,
    date: row.issueDate,
    dueDate: row.dueDate,
    customerId: row.customerId,
    customerName: row.customerName,
    customerVat: row.customerVat,
    customerAddress: row.customerAddress,
    currency: row.currency,
    status: row.status,
    template: row.template,
    notes: row.notes,
    items: items
      .sort((a, b) => a.position - b.position)
      .map<InvoiceItem>((it) => ({
        id: it.id,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discount: it.discount,
        vatRate: it.vatRate,
      })),
  };
}

export const listInvoices = createServerFn({ method: "GET" }).handler(async () => {
  const { orgId } = await requireUser();
  const rows = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.orgId, orgId))
    .orderBy(desc(schema.invoices.issueDate), desc(schema.invoices.createdAt));
  if (rows.length === 0) return [] as Invoice[];
  const items = await db
    .select()
    .from(schema.invoiceItems)
    .where(
      inArray(
        schema.invoiceItems.invoiceId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(schema.invoiceItems.position));
  const byInvoice = new Map<string, typeof items>();
  for (const it of items) {
    const list = byInvoice.get(it.invoiceId) ?? [];
    list.push(it);
    byInvoice.set(it.invoiceId, list);
  }
  return rows.map((r) => toInvoice(r, byInvoice.get(r.id) ?? []));
});

export const getInvoice = createServerFn({ method: "GET" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<Invoice | null> => {
    const { orgId } = await requireUser();
    const row = await db.query.invoices.findFirst({
      where: and(eq(schema.invoices.id, data.id), eq(schema.invoices.orgId, orgId)),
    });
    if (!row) return null;
    const items = await db
      .select()
      .from(schema.invoiceItems)
      .where(eq(schema.invoiceItems.invoiceId, row.id));
    return toInvoice(row, items);
  });

export const saveInvoice = createServerFn({ method: "POST" })
  .inputValidator(invoiceInput)
  .handler(async ({ data }) => {
    const { orgId } = await requireUser();
    const values = {
      orgId,
      number: data.number,
      issueDate: data.date,
      dueDate: data.dueDate,
      customerId: data.customerId,
      customerName: data.customerName,
      customerVat: data.customerVat,
      customerAddress: data.customerAddress,
      currency: data.currency.toUpperCase(),
      status: data.status,
      template: data.template,
      notes: data.notes,
      updatedAt: new Date(),
    };

    try {
      const id = await db.transaction(async (tx) => {
        let invoiceId: string;
        if (data.id) {
          const [updated] = await tx
            .update(schema.invoices)
            .set(values)
            .where(and(eq(schema.invoices.id, data.id), eq(schema.invoices.orgId, orgId)))
            .returning({ id: schema.invoices.id });
          if (!updated) throw new Error("Invoice not found");
          invoiceId = updated.id;
          await tx.delete(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, invoiceId));
        } else {
          const [created] = await tx
            .insert(schema.invoices)
            .values(values)
            .returning({ id: schema.invoices.id });
          invoiceId = created.id;
        }
        await tx.insert(schema.invoiceItems).values(
          data.items.map((it, position) => ({
            invoiceId,
            position,
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: it.discount,
            vatRate: it.vatRate,
          })),
        );
        return invoiceId;
      });
      return { ok: true as const, id };
    } catch (err) {
      if (err instanceof Error && /invoices_org_number_uq/.test(err.message)) {
        return { ok: false as const, error: `Invoice number ${data.number} already exists.` };
      }
      throw err;
    }
  });

export const deleteInvoice = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { orgId } = await requireUser();
    await db
      .delete(schema.invoices)
      .where(and(eq(schema.invoices.id, data.id), eq(schema.invoices.orgId, orgId)));
    return { ok: true as const };
  });
