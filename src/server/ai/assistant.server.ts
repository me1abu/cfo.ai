/**
 * The in-app AI assistant: answers questions about the signed-in workspace's own invoices,
 * customers and VAT. All tools are read-only and scoped to one organisation.
 */
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { loadCompany, loadDocs } from "../data.server";
import { computeTotals, round2, signedTotals, type Invoice } from "@/lib/invoice-math";
import { documentTitle, originalInfoFromDocs, validateInvoice } from "@/lib/zatca-rules";
import { FALLBACK, MODEL, getClaude } from "./claude.server";

const SYSTEM = `You are the assistant inside AI Invoice Saudi, an invoicing app for businesses in Saudi Arabia. You help the signed-in user understand their own invoices, credit notes, customers and VAT.

Use the tools to look up facts before answering, and only state figures that come from tool results. If the tools can't answer a question, say so plainly. You can't create, edit or delete anything; if asked to, explain where in the app the user can do it.

Credit notes reduce revenue and VAT. Amounts are in the document's currency, usually SAR. Issued invoices are locked and are corrected with a credit note. The app supports ZATCA Phase 1 (invoice generation and QR codes); Phase 2 integration with ZATCA's FATOORA platform is not supported yet.

Reply in the language the user writes in, Arabic or English. Keep answers short and concrete, in plain text: the chat shows no Markdown, so don't use headings, bold or tables. Short lists starting with a hyphen are fine. Give general VAT information, but for decisions about a specific tax position suggest checking with a tax advisor.`;

const dateArg = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .describe("Inclusive date YYYY-MM-DD");

function summary(d: Invoice) {
  const t = computeTotals(d.items);
  return {
    number: d.number,
    type: d.documentType,
    status: d.status,
    issued: d.issuedAt !== null,
    date: d.date,
    dueDate: d.dueDate,
    customer: d.customerName,
    currency: d.currency,
    subtotal: t.subtotal,
    vat: t.vat,
    total: t.total,
  };
}

function inRange(d: Invoice, from?: string, to?: string) {
  return (!from || d.date >= from) && (!to || d.date <= to);
}

function buildTools(orgId: string) {
  let docsCache: Invoice[] | null = null;
  const docs = async () => (docsCache ??= await loadDocs(db, orgId));

  return [
    betaZodTool({
      name: "list_invoices",
      description:
        "List invoices and credit notes, newest first, with totals. Filter by status, document type, customer name (partial match) and issue-date range.",
      inputSchema: z.object({
        status: z.enum(["draft", "unpaid", "paid", "overdue"]).optional(),
        documentType: z.enum(["invoice", "credit_note"]).optional(),
        customer: z.string().optional(),
        from: dateArg,
        to: dateArg,
        limit: z.number().int().min(1).max(50).optional(),
      }),
      run: async (a) => {
        const rows = (await docs())
          .filter((d) => !a.status || d.status === a.status)
          .filter((d) => !a.documentType || d.documentType === a.documentType)
          .filter(
            (d) => !a.customer || d.customerName.toLowerCase().includes(a.customer.toLowerCase()),
          )
          .filter((d) => inRange(d, a.from, a.to));
        return JSON.stringify({
          matched: rows.length,
          documents: rows.slice(0, a.limit ?? 20).map(summary),
        });
      },
    }),
    betaZodTool({
      name: "get_invoice",
      description:
        "Full details of one invoice or credit note by its number, including lines and any credit notes against it.",
      inputSchema: z.object({ number: z.string() }),
      run: async ({ number }) => {
        const all = await docs();
        const d = all.find((x) => x.number.toLowerCase() === number.trim().toLowerCase());
        if (!d) return JSON.stringify({ error: `No document numbered ${number}` });
        const original = d.originalInvoiceId
          ? all.find((x) => x.id === d.originalInvoiceId)
          : undefined;
        return JSON.stringify({
          ...summary(d),
          title: documentTitle(d).en,
          customerVat: d.customerVat,
          customerAddress: d.customerAddress,
          reason: d.reason || undefined,
          amends: original?.number,
          notes: d.notes || undefined,
          lines: d.items.map(({ id: _id, ...l }) => l),
          creditNotes: all.filter((x) => x.originalInvoiceId === d.id).map(summary),
        });
      },
    }),
    betaZodTool({
      name: "revenue_summary",
      description:
        "Revenue and VAT for a date range, net of issued credit notes, plus amounts still unpaid and overdue. Drafts are excluded.",
      inputSchema: z.object({ from: dateArg, to: dateArg }),
      run: async ({ from, to }) => {
        const rows = (await docs()).filter((d) => inRange(d, from, to));
        let revenue = 0;
        let vat = 0;
        let unpaid = 0;
        let overdue = 0;
        for (const d of rows) {
          const t = signedTotals(d);
          revenue = round2(revenue + t.total);
          vat = round2(vat + t.vat);
          if (d.documentType === "invoice" && d.status === "unpaid")
            unpaid = round2(unpaid + t.total);
          if (d.documentType === "invoice" && d.status === "overdue")
            overdue = round2(overdue + t.total);
        }
        return JSON.stringify({
          from: from ?? "beginning",
          to: to ?? "today",
          issuedInvoices: rows.filter((d) => d.documentType === "invoice" && d.issuedAt).length,
          issuedCreditNotes: rows.filter((d) => d.documentType === "credit_note" && d.issuedAt)
            .length,
          netRevenueInclVat: revenue,
          netVat: vat,
          unpaidTotal: unpaid,
          overdueTotal: overdue,
          note: "Mixed currencies are summed as numbers; most documents are SAR.",
        });
      },
    }),
    betaZodTool({
      name: "list_customers",
      description:
        "List customers in the address book, optionally filtered by name (partial match).",
      inputSchema: z.object({ query: z.string().optional() }),
      run: async ({ query }) => {
        const rows = await db
          .select()
          .from(schema.customers)
          .where(eq(schema.customers.orgId, orgId))
          .orderBy(asc(schema.customers.name));
        const q = query?.toLowerCase();
        return JSON.stringify(
          rows
            .filter((c) => !q || c.name.toLowerCase().includes(q))
            .slice(0, 50)
            .map((c) => ({
              name: c.name,
              vatNumber: c.vatNumber,
              crNumber: c.crNumber,
              address: c.address,
              email: c.email,
              phone: c.phone,
            })),
        );
      },
    }),
    betaZodTool({
      name: "validate_invoice",
      description:
        "Check one invoice or credit note against ZATCA's tax-invoice rules and return failed checks and warnings.",
      inputSchema: z.object({ number: z.string() }),
      run: async ({ number }) => {
        const all = await docs();
        const d = all.find((x) => x.number.toLowerCase() === number.trim().toLowerCase());
        if (!d) return JSON.stringify({ error: `No document numbered ${number}` });
        const company = await loadCompany(orgId);
        const report = validateInvoice(d, company, { original: originalInfoFromDocs(d, all) });
        return JSON.stringify({
          ready: report.ready,
          counts: report.counts,
          problems: report.checks
            .filter((c) => c.status !== "pass")
            .map(({ title, status, detail, source }) => ({ title, status, detail, source })),
        });
      },
    }),
  ];
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export class AssistantRefusedError extends Error {}

/** Runs one assistant turn over the conversation so far and returns the reply text. */
export async function runAssistant(orgId: string, history: ChatTurn[]): Promise<string> {
  const client = getClaude();
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({
    role: t.role,
    content: t.content,
  }));
  const final = await client.beta.messages.toolRunner({
    ...FALLBACK,
    betas: [...FALLBACK.betas],
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "medium" },
    tools: buildTools(orgId),
    messages,
    // Bounds cost and latency for one question.
    max_iterations: 8,
  });

  if (final.stop_reason === "refusal") {
    throw new AssistantRefusedError("The assistant can't help with that request.");
  }
  const text = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return text || "I couldn't put together an answer. Try rephrasing the question.";
}
