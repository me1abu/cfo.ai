import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireUser } from "./context";
import { loadCompany, loadDocs, loadInvoice, loadOriginalInfo } from "./data.server";
import type { Invoice } from "@/lib/invoice-math";
import { validateInvoice, type OriginalInvoiceInfo } from "@/lib/zatca-rules";

const LOCKED_ERROR =
  "This document has been issued and can't be changed or deleted. To correct an issued invoice, issue a credit note.";

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
  documentType: z.enum(["invoice", "credit_note"]).default("invoice"),
  originalInvoiceId: z.string().uuid().nullable().default(null),
  reason: z.string().trim().max(500).default(""),
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
  items: z.array(itemSchema).min(1, "Add at least one item").max(500),
});
export type InvoiceInput = z.infer<typeof invoiceInput>;

export const listInvoices = createServerFn({ method: "GET" }).handler(async () => {
  const { orgId } = await requireUser();
  return loadDocs(db, orgId);
});

export const getInvoice = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<Invoice | null> => {
    const { orgId } = await requireUser();
    return loadInvoice(orgId, data.id);
  });

class SaveRejected extends Error {}

export const saveInvoice = createServerFn({ method: "POST" })
  .validator(invoiceInput)
  .handler(async ({ data }) => {
    const { orgId } = await requireUser();
    const finalizing = data.status !== "draft";

    try {
      const id = await db.transaction(async (tx) => {
        let documentType = data.documentType;
        let originalInvoiceId = data.originalInvoiceId;

        if (data.id) {
          const existing = await tx.query.invoices.findFirst({
            where: and(eq(schema.invoices.id, data.id), eq(schema.invoices.orgId, orgId)),
            columns: { issuedAt: true, documentType: true, originalInvoiceId: true },
          });
          if (!existing) throw new SaveRejected("Invoice not found");
          if (existing.issuedAt) throw new SaveRejected(LOCKED_ERROR);
          // A draft's type and original invoice are fixed when it is created.
          documentType = existing.documentType;
          originalInvoiceId = existing.originalInvoiceId;
        }

        let customer = {
          customerId: data.customerId,
          customerName: data.customerName,
          customerVat: data.customerVat,
          customerAddress: data.customerAddress,
          currency: data.currency.toUpperCase(),
        };
        let original: OriginalInvoiceInfo | null = null;

        if (documentType === "credit_note") {
          if (!originalInvoiceId)
            throw new SaveRejected("A credit note must reference an invoice.");
          // Lock the original so concurrent credit notes can't together exceed its total.
          await tx
            .select({ id: schema.invoices.id })
            .from(schema.invoices)
            .where(and(eq(schema.invoices.id, originalInvoiceId), eq(schema.invoices.orgId, orgId)))
            .for("update");
          const loaded = await loadOriginalInfo(orgId, originalInvoiceId, data.id, tx);
          if (!loaded) throw new SaveRejected("The original invoice was not found.");
          if (loaded.original.documentType !== "invoice" || !loaded.original.issuedAt) {
            throw new SaveRejected("Credit notes can only amend an issued invoice.");
          }
          original = loaded.info;
          // A credit note always concerns the original invoice's customer and currency.
          customer = {
            customerId: loaded.original.customerId,
            customerName: loaded.original.customerName,
            customerVat: loaded.original.customerVat,
            customerAddress: loaded.original.customerAddress,
            currency: loaded.original.currency,
          };
        } else {
          originalInvoiceId = null;
        }

        if (finalizing) {
          // Issuing locks the document for good, so it must pass validation first.
          const company = await loadCompany(orgId);
          const candidate: Invoice = {
            ...data,
            ...customer,
            id: data.id ?? "",
            documentType,
            originalInvoiceId,
            issuedAt: new Date().toISOString(),
            items: data.items.map((it, i) => ({ ...it, id: String(i) })),
          };
          const report = validateInvoice(candidate, company, { original });
          if (!report.ready) {
            const failed = report.checks.filter((c) => c.status === "fail").map((c) => c.title);
            throw new SaveRejected(
              `Can't issue yet. Fix: ${failed.join(", ")}. Use Validate to see details.`,
            );
          }
        }

        const values = {
          orgId,
          documentType,
          originalInvoiceId,
          reason: documentType === "credit_note" ? data.reason : "",
          number: data.number,
          issueDate: data.date,
          dueDate: data.dueDate,
          ...customer,
          status: data.status,
          template: data.template,
          notes: data.notes,
          // Stamped once when the document leaves draft; it is then locked.
          issuedAt: finalizing ? new Date() : null,
          updatedAt: new Date(),
        };

        let invoiceId: string;
        if (data.id) {
          const [updated] = await tx
            .update(schema.invoices)
            .set(values)
            .where(and(eq(schema.invoices.id, data.id), eq(schema.invoices.orgId, orgId)))
            .returning({ id: schema.invoices.id });
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
      if (err instanceof SaveRejected) return { ok: false as const, error: err.message };
      if (err instanceof Error && /invoices_org_number_uq/.test(err.message)) {
        return { ok: false as const, error: `Number ${data.number} already exists.` };
      }
      throw err;
    }
  });

/** Payment status is the only thing that may change once a document is issued. */
export const setInvoiceStatus = createServerFn({ method: "POST" })
  // Overdue and credited are derived from dates and credit notes (paymentViews), not stored.
  .validator(z.object({ id: z.string().uuid(), status: z.enum(["unpaid", "paid"]) }))
  .handler(async ({ data }) => {
    const { orgId } = await requireUser();
    const existing = await db.query.invoices.findFirst({
      where: and(eq(schema.invoices.id, data.id), eq(schema.invoices.orgId, orgId)),
      columns: { issuedAt: true, documentType: true },
    });
    if (!existing) return { ok: false as const, error: "Invoice not found" };
    if (!existing.issuedAt) {
      return { ok: false as const, error: "Issue the document before recording payment." };
    }
    await db
      .update(schema.invoices)
      .set({ status: data.status, updatedAt: new Date() })
      .where(and(eq(schema.invoices.id, data.id), eq(schema.invoices.orgId, orgId)));
    return { ok: true as const };
  });

/** Only drafts can be deleted; issued documents must be kept and corrected by credit note. */
export const deleteInvoice = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { orgId } = await requireUser();
    const existing = await db.query.invoices.findFirst({
      where: and(eq(schema.invoices.id, data.id), eq(schema.invoices.orgId, orgId)),
      columns: { issuedAt: true },
    });
    if (!existing) return { ok: false as const, error: "Invoice not found" };
    if (existing.issuedAt) return { ok: false as const, error: LOCKED_ERROR };
    await db
      .delete(schema.invoices)
      .where(and(eq(schema.invoices.id, data.id), eq(schema.invoices.orgId, orgId)));
    return { ok: true as const };
  });
