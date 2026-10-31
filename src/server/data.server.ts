/**
 * Server-only data loaders shared by server functions.
 *
 * These live in a `.server.ts` module on purpose: plain exported functions in a server-function
 * file stay in that file's client module, which pulls the database driver into the browser bundle
 * in development ("Buffer is not defined"). Server functions import from here inside handlers only.
 */
import { and, asc, desc, eq, inArray, isNotNull, ne, type SQL } from "drizzle-orm";
import { db, schema } from "@/db/client";
import {
  computeTotals,
  round2,
  type Company,
  type Invoice,
  type InvoiceItem,
} from "@/lib/invoice-math";
import type { OriginalInvoiceInfo } from "@/lib/zatca-rules";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Exec = typeof db | DbTx;

function toInvoice(
  row: typeof schema.invoices.$inferSelect,
  items: (typeof schema.invoiceItems.$inferSelect)[],
): Invoice {
  return {
    id: row.id,
    documentType: row.documentType,
    originalInvoiceId: row.originalInvoiceId,
    reason: row.reason,
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
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
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

/** Loads documents for an organisation, optionally filtered, with their items. */
export async function loadDocs(exec: Exec, orgId: string, where?: SQL): Promise<Invoice[]> {
  const rows = await exec
    .select()
    .from(schema.invoices)
    .where(where ? and(eq(schema.invoices.orgId, orgId), where) : eq(schema.invoices.orgId, orgId))
    .orderBy(desc(schema.invoices.issueDate), desc(schema.invoices.createdAt));
  if (rows.length === 0) return [];
  const items = await exec
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
}

/** Loads one document scoped to the organisation. */
export async function loadInvoice(
  orgId: string,
  id: string,
  exec: Exec = db,
): Promise<Invoice | null> {
  const [doc] = await loadDocs(exec, orgId, eq(schema.invoices.id, id));
  return doc ?? null;
}

/**
 * The validator's view of the invoice a credit note amends: whether it is an issued invoice and
 * how much is still creditable after other issued credit notes against it.
 */
export async function loadOriginalInfo(
  orgId: string,
  originalId: string,
  excludeCreditNoteId?: string,
  exec: Exec = db,
): Promise<{ original: Invoice; info: OriginalInvoiceInfo } | null> {
  const original = await loadInvoice(orgId, originalId, exec);
  if (!original) return null;
  const conditions = [
    eq(schema.invoices.originalInvoiceId, originalId),
    isNotNull(schema.invoices.issuedAt),
  ];
  if (excludeCreditNoteId) conditions.push(ne(schema.invoices.id, excludeCreditNoteId));
  const notes = await loadDocs(exec, orgId, and(...conditions));
  const credited = notes.reduce((sum, n) => sum + computeTotals(n.items).total, 0);
  return {
    original,
    info: {
      number: original.number,
      date: original.date,
      issued: original.issuedAt !== null,
      documentType: original.documentType,
      creditable: round2(computeTotals(original.items).total - credited),
    },
  };
}

export const toCompany = (o: typeof schema.organizations.$inferSelect): Company => ({
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

/** Loads the organisation's company profile. */
export async function loadCompany(orgId: string): Promise<Company> {
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, orgId),
  });
  if (!org) throw new Error("Organisation not found");
  return toCompany(org);
}
