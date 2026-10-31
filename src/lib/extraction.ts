/**
 * Shape of invoice data extracted from a document by AI, plus pure helpers that turn it into
 * app objects and check it. Shared by server and client; no AI calls here.
 */
import { z } from "zod/v4";
import { computeTotals, round2, type Company, type Invoice } from "./invoice-math";
import { validateInvoice, type ValidationCheck, type ValidationReport } from "./zatca-rules";

export const ACCEPTED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
export type AcceptedDocumentType = (typeof ACCEPTED_DOCUMENT_TYPES)[number];

/**
 * Files travel to the server as Base64 inside one request. Vercel caps a function request at
 * 4.5 MB and Base64 adds a third, so 3 MB of file keeps us safely under the limit.
 */
export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;

const Party = z.object({
  name: z.string().nullable(),
  vatNumber: z
    .string()
    .nullable()
    .describe("VAT registration number exactly as printed, digits only, no spaces"),
  crNumber: z.string().nullable().describe("Commercial registration (CR) number if printed"),
  address: z.string().nullable().describe("Full address as printed, one line"),
});

export const ExtractionSchema = z.object({
  isInvoice: z
    .boolean()
    .describe("True only if the document is an invoice, simplified invoice, or credit/debit note"),
  documentKind: z.enum([
    "tax_invoice",
    "simplified_tax_invoice",
    "credit_note",
    "debit_note",
    "quotation",
    "receipt",
    "purchase_order",
    "other",
  ]),
  language: z.enum(["arabic", "english", "bilingual", "other"]),
  invoiceNumber: z.string().nullable(),
  issueDate: z
    .string()
    .nullable()
    .describe("Gregorian date as YYYY-MM-DD. Null if only a Hijri date is printed."),
  dueDate: z.string().nullable().describe("Gregorian date as YYYY-MM-DD, or null"),
  currency: z.string().nullable().describe("ISO 4217 code such as SAR"),
  seller: Party,
  buyer: Party,
  lines: z.array(
    z.object({
      description: z.string(),
      quantity: z.number(),
      unitPrice: z.number().describe("Price per unit excluding VAT"),
      discount: z
        .number()
        .describe("Discount for the whole line as an amount, 0 if none. Convert percentages."),
      vatRate: z.number().describe("VAT rate as a percentage, e.g. 15"),
    }),
  ),
  statedTotals: z.object({
    subtotal: z.number().nullable().describe("Total excluding VAT as printed"),
    vat: z.number().nullable().describe("Total VAT as printed"),
    total: z.number().nullable().describe("Total including VAT as printed"),
  }),
  hasQrCode: z.boolean().describe("True if a QR code is visible on the document"),
  notes: z.string().nullable(),
  warnings: z
    .array(z.string())
    .describe("Anything unreadable, ambiguous, or inconsistent, in plain English"),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

const isoDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

/** The extracted document as an app invoice (seller unknown to the app; buyer becomes customer). */
export function extractionToInvoice(
  x: Extraction,
  defaults: { currency: string; vatRate: number; today: string },
): Invoice {
  const date = isoDate(x.issueDate) ?? defaults.today;
  return {
    id: "",
    documentType: "invoice",
    originalInvoiceId: null,
    reason: "",
    number: x.invoiceNumber?.trim() || "",
    date,
    dueDate: isoDate(x.dueDate) ?? date,
    customerId: null,
    customerName: x.buyer.name?.trim() ?? "",
    customerVat: (x.buyer.vatNumber ?? "").replace(/\s+/g, ""),
    customerAddress: x.buyer.address?.trim() ?? "",
    currency: (x.currency ?? defaults.currency).toUpperCase().slice(0, 3),
    items: x.lines.map((l, i) => ({
      id: `x${i}`,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount,
      vatRate: Number.isFinite(l.vatRate) ? l.vatRate : defaults.vatRate,
    })),
    status: "unpaid",
    notes: x.notes ?? "",
    template: x.language === "arabic" || x.language === "bilingual" ? "bilingual" : "modern",
    issuedAt: null,
  };
}

export function extractionSeller(x: Extraction): Company {
  return {
    name: x.seller.name?.trim() ?? "",
    logoUrl: "",
    vatNumber: (x.seller.vatNumber ?? "").replace(/\s+/g, ""),
    crNumber: x.seller.crNumber ?? "",
    address: x.seller.address?.trim() ?? "",
    bank: "",
    email: "",
    phone: "",
    website: "",
    footer: "",
    currency: x.currency ?? "SAR",
    vatRate: 15,
  };
}

/**
 * Checks a third-party invoice read by AI: ZATCA content rules on the extracted data, plus
 * whether the printed totals agree with the line items. Replaces the QR check, which on a
 * received invoice is about the printed code, not one we generate.
 */
export function checkExtractedInvoice(x: Extraction, today: string): ValidationReport {
  const inv = extractionToInvoice(x, { currency: "SAR", vatRate: 15, today });
  const base = validateInvoice(inv, extractionSeller(x), { today });
  const checks: ValidationCheck[] = base.checks.filter((c) => c.id !== "qr");

  if (!x.isInvoice) {
    checks.unshift({
      id: "is-invoice",
      title: "Document type",
      status: "fail",
      detail: `This looks like a ${x.documentKind.replace(/_/g, " ")}, not a tax invoice.`,
      source: "TIG 4.2",
    });
  }

  checks.push(
    x.hasQrCode
      ? {
          id: "qr",
          title: "QR code",
          status: "pass",
          detail: "A QR code is printed. Use the QR Scanner to decode and check its contents.",
          source: "QR guide, TIG 4.2.3",
        }
      : {
          id: "qr",
          title: "QR code",
          status: "fail",
          detail: "No QR code was found on the document.",
          source: "QR guide, TIG 4.2.3",
        },
  );

  const computed = computeTotals(inv.items);
  const mismatches: string[] = [];
  const compare = (label: string, stated: number | null, calc: number) => {
    if (stated === null) return;
    if (Math.abs(round2(stated) - calc) > 0.01) {
      mismatches.push(`${label} printed ${stated.toFixed(2)}, lines add up to ${calc.toFixed(2)}`);
    }
  };
  compare("subtotal", x.statedTotals.subtotal, computed.subtotal);
  compare("VAT", x.statedTotals.vat, computed.vat);
  compare("total", x.statedTotals.total, computed.total);
  const anyStated = [x.statedTotals.subtotal, x.statedTotals.vat, x.statedTotals.total].some(
    (v) => v !== null,
  );
  checks.push(
    mismatches.length
      ? {
          id: "arithmetic",
          title: "Totals match the lines",
          status: "fail",
          detail: `${mismatches.join("; ")}.`,
          source: "TIG 4.2.3, 4.2.4",
        }
      : {
          id: "arithmetic",
          title: "Totals match the lines",
          status: anyStated ? "pass" : "warn",
          detail: anyStated
            ? "Printed totals agree with the line items to the halala."
            : "No totals could be read from the document.",
          source: "TIG 4.2.3, 4.2.4",
        },
  );

  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) counts[c.status]++;
  return { ...base, checks, counts, ready: counts.fail === 0 };
}
