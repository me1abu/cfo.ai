import { loadCompany, loadInvoice } from "./data.server";
import { renderInvoicePdf } from "./invoice-pdf.server";

/** Renders a saved document for download or email. Null if it isn't in this organisation. */
export async function loadDocumentPdf(orgId: string, id: string) {
  const [invoice, company] = await Promise.all([loadInvoice(orgId, id), loadCompany(orgId)]);
  if (!invoice) return null;
  const original = invoice.originalInvoiceId
    ? await loadInvoice(orgId, invoice.originalInvoiceId)
    : null;
  const pdf = await renderInvoicePdf(
    invoice,
    company,
    original ? { number: original.number, date: original.date } : null,
  );
  const safeNumber = invoice.number.replace(/[^A-Za-z0-9._-]+/g, "_");
  return {
    invoice,
    company,
    filename: `${safeNumber}${invoice.status === "draft" ? "-DRAFT" : ""}.pdf`,
    base64: Buffer.from(pdf).toString("base64"),
  };
}
