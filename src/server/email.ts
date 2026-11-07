import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./context";
import { loadDocumentPdf } from "./document-pdf.server";
import { EmailNotConfiguredError, EmailSendError, sendEmail } from "./email.server";
import { AiLimitReachedError, reserveAiCall } from "./ai/usage.server";
import { serverEnv } from "@/lib/env.server";
import { isIssued } from "@/lib/invoice-math";
import { invoiceEmailContent, senderHeader } from "@/lib/invoice-email";

/** Emails an issued invoice or credit note to a customer as a PDF attachment. */
export const emailInvoice = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), to: z.string().trim().email().max(254) }))
  .handler(async ({ data }) => {
    const { orgId } = await requireUser();
    if (!serverEnv.EMAIL_FROM) {
      return { ok: false as const, error: new EmailNotConfiguredError().message };
    }
    try {
      const doc = await loadDocumentPdf(orgId, data.id);
      if (!doc) return { ok: false as const, error: "Invoice not found" };
      if (!isIssued(doc.invoice)) {
        return { ok: false as const, error: "Issue the document before emailing it." };
      }
      const release = await reserveAiCall(orgId, "email");
      try {
        await sendEmail({
          from: senderHeader(doc.company.name, serverEnv.EMAIL_FROM),
          to: data.to,
          replyTo: doc.company.email,
          ...invoiceEmailContent(doc.invoice, doc.company.name),
          attachment: { filename: doc.filename, base64: doc.base64 },
        });
      } catch (err) {
        await release().catch(() => {});
        throw err;
      }
      return { ok: true as const };
    } catch (err) {
      if (
        err instanceof AiLimitReachedError ||
        err instanceof EmailNotConfiguredError ||
        err instanceof EmailSendError
      ) {
        return { ok: false as const, error: err.message };
      }
      console.error("Emailing invoice failed", err);
      return { ok: false as const, error: "The email could not be sent. Please try again." };
    }
  });
