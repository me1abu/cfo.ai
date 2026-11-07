import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./context";
import { CLEARANCE_PENDING, needsClearance } from "@/lib/zatca-rules";
import { loadDocumentPdf } from "./document-pdf.server";

/** Renders the saved invoice as a bilingual PDF. Returns Base64 so it travels as JSON. */
export const getInvoicePdf = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { orgId } = await requireUser();
    const doc = await loadDocumentPdf(orgId, data.id);
    if (!doc) return { ok: false as const, error: "Invoice not found" };
    if (needsClearance(doc.invoice)) {
      return { ok: false as const, error: CLEARANCE_PENDING };
    }
    return { ok: true as const, filename: doc.filename, base64: doc.base64 };
  });
