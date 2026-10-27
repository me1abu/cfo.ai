import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./context";
import { loadInvoice } from "./invoices";
import { loadCompany } from "./company";
import { renderInvoicePdf } from "./invoice-pdf.server";

/** Renders the saved invoice as a bilingual PDF. Returns Base64 so it travels as JSON. */
export const getInvoicePdf = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { orgId } = await requireUser();
    const [invoice, company] = await Promise.all([loadInvoice(orgId, data.id), loadCompany(orgId)]);
    if (!invoice) return { ok: false as const, error: "Invoice not found" };
    const pdf = await renderInvoicePdf(invoice, company);
    const safeNumber = invoice.number.replace(/[^A-Za-z0-9._-]+/g, "_");
    return {
      ok: true as const,
      filename: `${safeNumber}${invoice.status === "draft" ? "-DRAFT" : ""}.pdf`,
      base64: Buffer.from(pdf).toString("base64"),
    };
  });
