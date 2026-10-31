/**
 * Saudi tax-invoice validation for invoices created in this app.
 *
 * Every check cites the published ZATCA source it implements:
 *  - TIG: "Guideline for Tax Invoicing and Records under VAT Provisions" (section numbers).
 *  - XML: "Electronic Invoice XML Implementation Standard" v1.2 business rules (BR-KSA-*).
 *  - QR:  "Guide to Developed FATOORA Compliant QR Code" (Nov 2021).
 *
 * Scope: content requirements for tax invoices and the Phase 1 (generation) QR code.
 * Phase 2 integration (XML, cryptographic stamp, invoice hash, reporting/clearance with
 * ZATCA) is not covered.
 */
import { computeTotals, lineSubtotal, type Company, type Invoice } from "./invoice-math";
import { buildPhase1Qr, invoiceQrTimestamp, ZatcaQrError } from "./zatca-qr";

/**
 * Seller and buyer VAT registration numbers: 15 digits, first and last digit "3".
 * Source: XML BR-KSA-40 (seller) and BR-KSA-44 (buyer, non-export).
 */
export function isValidSaudiVatNumber(value: string): boolean {
  return /^3\d{13}3$/.test(value.trim());
}

/** Simplified invoices may be used for supplies under SAR 1,000 (TIG 4.3.1). */
export const SIMPLIFIED_THRESHOLD_SAR = 1000;
/** The basic VAT rate (TIG 4.3.2). */
export const STANDARD_VAT_RATE = 15;

export type InvoiceKind = "standard" | "simplified";

/**
 * A buyer VAT number means a business customer, so a standard tax invoice is required.
 * Without one, the invoice is treated as simplified (a supply to an individual not subject to
 * VAT, or a supply under SAR 1,000, TIG 4.3.1). The "invoice-type" check flags the ambiguous
 * case of a large supply with no buyer VAT number.
 */
export function invoiceKind(inv: Pick<Invoice, "customerVat">): InvoiceKind {
  return inv.customerVat.trim() ? "standard" : "simplified";
}

export const INVOICE_TITLES: Record<InvoiceKind, { en: string; ar: string }> = {
  // Arabic titles as printed on ZATCA's sample invoices in the TIG annex.
  standard: { en: "Tax Invoice", ar: "فاتورة ضريبية" },
  simplified: { en: "Simplified Tax Invoice", ar: "فاتورة ضريبية مبسطة" },
};

/** As printed on ZATCA's credit-note samples in the TIG annex. */
export const CREDIT_NOTE_TITLE = { en: "Credit Note", ar: "إشعار دائن" };

export function documentTitle(inv: Pick<Invoice, "documentType" | "customerVat">) {
  return inv.documentType === "credit_note" ? CREDIT_NOTE_TITLE : INVOICE_TITLES[invoiceKind(inv)];
}

/**
 * Reasons a credit note may be issued, from the Tax Invoicing Guideline s.7.1. A credit note may
 * not be used for adjustments unrelated to a prior supply (s.7.1, Example 19).
 */
export const CREDIT_NOTE_REASONS = [
  "Supply cancelled or suspended, in whole or in part",
  "Change in the nature of the supply affecting the tax due",
  "Price reduced after the sale, including an additional discount",
  "Goods or services returned and accepted by the supplier",
  "Error in the supplier's or customer's details on the invoice",
] as const;

/** What the validator needs to know about the invoice a credit note amends. */
export interface OriginalInvoiceInfo {
  number: string;
  date: string;
  issued: boolean;
  documentType: Invoice["documentType"];
  /** Original total minus other issued credit notes against it. */
  creditable: number;
}

export type CheckStatus = "pass" | "warn" | "fail";

export interface ValidationCheck {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  source: string;
}

export interface ValidationReport {
  kind: InvoiceKind;
  title: { en: string; ar: string };
  checks: ValidationCheck[];
  counts: Record<CheckStatus, number>;
  /** True when no check failed. Warnings still deserve a look. */
  ready: boolean;
}

const pass = (id: string, title: string, detail: string, source: string): ValidationCheck => ({
  id,
  title,
  status: "pass",
  detail,
  source,
});
const warn = (id: string, title: string, detail: string, source: string): ValidationCheck => ({
  id,
  title,
  status: "warn",
  detail,
  source,
});
const fail = (id: string, title: string, detail: string, source: string): ValidationCheck => ({
  id,
  title,
  status: "fail",
  detail,
  source,
});

function isRealDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export function validateInvoice(
  inv: Invoice,
  company: Company,
  opts: { today?: string; original?: OriginalInvoiceInfo | null } = {},
): ValidationReport {
  const checks: ValidationCheck[] = [];
  const kind = invoiceKind(inv);
  const totals = computeTotals(inv.items);
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  // --- Seller -------------------------------------------------------------------------
  checks.push(
    company.name.trim()
      ? pass("seller-name", "Seller name", company.name, "TIG 4.2.3, 4.3.2")
      : fail(
          "seller-name",
          "Seller name",
          "Add your legal name, as on your VAT registration certificate, in Company Profile.",
          "TIG 4.2.3, 4.3.2",
        ),
  );
  checks.push(
    company.address.trim()
      ? pass("seller-address", "Seller address", company.address, "TIG 4.2.3, 4.3.2")
      : fail(
          "seller-address",
          "Seller address",
          "Add your address in the Kingdom, per your National Address, in Company Profile.",
          "TIG 4.2.3, 4.3.2",
        ),
  );
  if (!company.vatNumber.trim()) {
    checks.push(
      fail(
        "seller-vat",
        "Seller VAT number",
        "Add your VAT registration number in Company Profile.",
        "XML BR-KSA-39",
      ),
    );
  } else if (!isValidSaudiVatNumber(company.vatNumber)) {
    checks.push(
      fail(
        "seller-vat",
        "Seller VAT number",
        `"${company.vatNumber}" must be 15 digits, starting and ending with 3.`,
        "XML BR-KSA-40",
      ),
    );
  } else {
    checks.push(pass("seller-vat", "Seller VAT number", company.vatNumber, "XML BR-KSA-40"));
  }

  // --- Document -----------------------------------------------------------------------
  checks.push(
    inv.number.trim()
      ? pass(
          "invoice-number",
          "Sequential invoice number",
          `${inv.number}. Numbers are unique within your workspace.`,
          "TIG 4.2.3",
        )
      : fail(
          "invoice-number",
          "Sequential invoice number",
          "Every invoice needs a unique sequential number.",
          "TIG 4.2.3",
        ),
  );
  if (!isRealDate(inv.date)) {
    checks.push(
      fail("issue-date", "Issue date", "The issue date is missing or invalid.", "TIG 4.2.3"),
    );
  } else if (inv.date > today) {
    checks.push(
      warn(
        "issue-date",
        "Issue date",
        `${inv.date} is in the future. The issue date is the date the invoice is created.`,
        "TIG 4.2.3",
      ),
    );
  } else {
    checks.push(
      pass(
        "issue-date",
        "Issue date and time",
        inv.issuedAt
          ? `${inv.date}, time recorded when finalized.`
          : `${inv.date}. The time is recorded when you finalize the invoice.`,
        "TIG 4.2.3",
      ),
    );
  }

  // --- Credit note reference and reason ------------------------------------------------
  if (inv.documentType === "credit_note") {
    const o = opts.original;
    if (!o || !o.issued || o.documentType !== "invoice") {
      checks.push(
        fail(
          "credit-reference",
          "Original invoice",
          "A credit note must reference the issued tax invoice it amends.",
          "TIG 7, XML BR-KSA-56",
        ),
      );
    } else {
      checks.push(
        pass(
          "credit-reference",
          "Original invoice",
          `Amends invoice ${o.number}, issued ${o.date}.`,
          "TIG 7, XML BR-KSA-56",
        ),
      );
      checks.push(
        totals.total <= o.creditable + 0.005
          ? pass(
              "credit-amount",
              "Credit amount",
              `SAR ${totals.total.toFixed(2)} of SAR ${o.creditable.toFixed(2)} still creditable on ${o.number}.`,
              "TIG 7",
            )
          : fail(
              "credit-amount",
              "Credit amount",
              `SAR ${totals.total.toFixed(2)} exceeds the SAR ${o.creditable.toFixed(2)} still creditable on ${o.number}.`,
              "TIG 7",
            ),
      );
    }
    checks.push(
      inv.reason.trim()
        ? pass("credit-reason", "Reason for the credit note", inv.reason, "XML BR-KSA-17, TIG 7.1")
        : fail(
            "credit-reason",
            "Reason for the credit note",
            "State why the credit note is issued, for example returned goods or a price reduction.",
            "XML BR-KSA-17, TIG 7.1",
          ),
    );
  }

  // --- Invoice type and customer ------------------------------------------------------
  if (inv.documentType === "credit_note") {
    checks.push(
      pass(
        "invoice-type",
        "Document type",
        `Credit note for a ${kind === "standard" ? "standard" : "simplified"} tax invoice.`,
        "TIG 7",
      ),
    );
  } else if (kind === "standard") {
    checks.push(
      pass(
        "invoice-type",
        "Invoice type",
        "Standard tax invoice, because the customer has a VAT number.",
        "TIG 4.2.3",
      ),
    );
  } else if (totals.total >= SIMPLIFIED_THRESHOLD_SAR) {
    checks.push(
      warn(
        "invoice-type",
        "Invoice type",
        `Issued as a simplified tax invoice for SAR ${totals.total.toFixed(2)}. Above SAR 1,000 that is only allowed for individuals not registered for VAT. If the customer is a business, add its VAT number so a standard tax invoice is issued.`,
        "TIG 4.3.1",
      ),
    );
  } else {
    checks.push(
      pass(
        "invoice-type",
        "Invoice type",
        "Simplified tax invoice: no customer VAT number and under SAR 1,000.",
        "TIG 4.3.1",
      ),
    );
  }

  if (kind === "standard") {
    checks.push(
      inv.customerName.trim()
        ? pass("customer-name", "Customer name", inv.customerName, "TIG 4.2.3, XML BR-KSA-42")
        : fail(
            "customer-name",
            "Customer name",
            "A standard tax invoice must show the customer's name.",
            "TIG 4.2.3, XML BR-KSA-42",
          ),
    );
    checks.push(
      inv.customerAddress.trim()
        ? pass("customer-address", "Customer address", inv.customerAddress, "TIG 4.2.3")
        : fail(
            "customer-address",
            "Customer address",
            "A standard tax invoice must show the customer's address.",
            "TIG 4.2.3",
          ),
    );
    checks.push(
      isValidSaudiVatNumber(inv.customerVat)
        ? pass("customer-vat", "Customer VAT number", inv.customerVat, "XML BR-KSA-44")
        : fail(
            "customer-vat",
            "Customer VAT number",
            `"${inv.customerVat}" must be 15 digits, starting and ending with 3.`,
            "XML BR-KSA-44",
          ),
    );
  }

  // --- Lines --------------------------------------------------------------------------
  const lineProblems: string[] = [];
  inv.items.forEach((it, i) => {
    const n = i + 1;
    if (!it.description.trim()) lineProblems.push(`line ${n} has no description`);
    if (!(it.quantity > 0)) lineProblems.push(`line ${n} has no quantity`);
    if (it.unitPrice < 0) lineProblems.push(`line ${n} has a negative price`);
    if (lineSubtotal(it) < 0) lineProblems.push(`line ${n}'s discount exceeds its value`);
  });
  checks.push(
    inv.items.length === 0
      ? fail("lines", "Line items", "Add at least one item.", "TIG 4.2.3")
      : lineProblems.length
        ? fail(
            "lines",
            "Line items",
            `Fix: ${lineProblems.join("; ")}. Each line needs a description, unit price and quantity.`,
            "TIG 4.2.3",
          )
        : pass(
            "lines",
            "Line items",
            `${inv.items.length} line${inv.items.length === 1 ? "" : "s"}, each with description, quantity, unit price, discount, VAT rate and amounts.`,
            "TIG 4.2.3",
          ),
  );

  const unusualRates = [...new Set(inv.items.map((i) => i.vatRate))].filter(
    (r) => r !== STANDARD_VAT_RATE && r !== 0,
  );
  const zeroRated = inv.items.some((i) => i.vatRate === 0);
  if (unusualRates.length) {
    checks.push(
      warn(
        "vat-rate",
        "VAT rate",
        `Rate${unusualRates.length > 1 ? "s" : ""} ${unusualRates.join("%, ")}% used. The basic rate is 15%; other supplies are zero-rated or exempt at 0%.`,
        "TIG 4.3.2",
      ),
    );
  } else if (zeroRated && !inv.notes.trim()) {
    checks.push(
      warn(
        "vat-rate",
        "VAT rate",
        "Some lines are at 0%. When tax isn't charged at the standard rate, the invoice must state why, for example an export or an exempt supply. Add this in Notes.",
        "TIG 4.2.3",
      ),
    );
  } else {
    checks.push(
      pass(
        "vat-rate",
        "VAT rate",
        zeroRated
          ? "15% and 0% lines, with a statement in Notes."
          : "All lines at the 15% basic rate.",
        zeroRated ? "TIG 4.2.3" : "TIG 4.3.2",
      ),
    );
  }

  checks.push(
    totals.total > 0
      ? pass(
          "totals",
          "Totals and VAT",
          `Subtotal ${totals.subtotal.toFixed(2)}, VAT ${totals.vat.toFixed(2)}, total ${totals.total.toFixed(2)}. VAT is rounded to the nearest halala per line.`,
          "TIG 4.2.4",
        )
      : warn("totals", "Totals and VAT", "The invoice total is zero.", "TIG 4.2.3"),
  );

  // --- Currency -----------------------------------------------------------------------
  checks.push(
    inv.currency.toUpperCase() === "SAR"
      ? pass("currency", "Currency", "Amounts and VAT are in Saudi riyals.", "TIG 4.2.2")
      : fail(
          "currency",
          "Currency",
          `This invoice is in ${inv.currency}. The VAT amount must also be stated in SAR, converted at the Saudi Central Bank's daily rate. The app can't show that conversion yet, so issue this invoice in SAR.`,
          "TIG 4.2.2",
        ),
  );

  // --- Language -----------------------------------------------------------------------
  checks.push(
    inv.template === "arabic" || inv.template === "bilingual"
      ? pass(
          "arabic",
          "Arabic language",
          `The ${inv.template === "arabic" ? "Arabic" : "Arabic-English"} template is used.`,
          "TIG 4.2.1",
        )
      : fail(
          "arabic",
          "Arabic language",
          "Tax invoices must be issued in Arabic, optionally alongside another language. Switch to the Arabic or Arabic-English template.",
          "TIG 4.2.1",
        ),
  );

  // --- QR code ------------------------------------------------------------------------
  try {
    buildPhase1Qr({
      sellerName: company.name,
      vatNumber: company.vatNumber,
      timestamp: invoiceQrTimestamp(inv.date, inv.issuedAt),
      total: totals.total,
      vatTotal: totals.vat,
    });
    checks.push(
      pass(
        "qr",
        "QR code",
        "ZATCA QR with seller name, VAT number, timestamp, total and VAT total.",
        "QR guide, TIG 4.2.3",
      ),
    );
  } catch (err) {
    if (!(err instanceof ZatcaQrError)) throw err;
    checks.push(fail("qr", "QR code", err.message, "QR guide, TIG 4.2.3"));
  }

  // --- Commercial (not a VAT requirement) ---------------------------------------------
  if (isRealDate(inv.date) && isRealDate(inv.dueDate) && inv.dueDate < inv.date) {
    checks.push(
      warn(
        "due-date",
        "Due date",
        "The due date is before the issue date. Due dates aren't a VAT requirement, but this is likely a mistake.",
        "TIG 4.2.5",
      ),
    );
  }

  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) counts[c.status]++;
  return { kind, title: documentTitle(inv), checks, counts, ready: counts.fail === 0 };
}

/**
 * What the validator needs about the invoice a credit note amends, computed from the loaded
 * documents: the original's total minus other issued credit notes against it.
 */
export function originalInfoFromDocs(inv: Invoice, docs: Invoice[]): OriginalInvoiceInfo | null {
  if (inv.documentType !== "credit_note" || !inv.originalInvoiceId) return null;
  const original = docs.find((d) => d.id === inv.originalInvoiceId);
  if (!original) return null;
  const credited = docs
    .filter((d) => d.originalInvoiceId === original.id && d.id !== inv.id && d.issuedAt)
    .reduce((sum, d) => sum + computeTotals(d.items).total, 0);
  return {
    number: original.number,
    date: original.date,
    issued: original.issuedAt !== null,
    documentType: original.documentType,
    creditable: Math.round((computeTotals(original.items).total - credited) * 100) / 100,
  };
}
