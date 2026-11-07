// Turns the app's invoices into ZATCA documents, and says what stops one from being sent.

import { type Company, type Invoice, isCreditNote } from "./invoice-math";
import { nationalAddressProblems } from "./national-address";
import { invoiceKind } from "./zatca-rules";
import type { ZatcaDocument, ZatcaParty } from "./zatca-xml";

const riyadhClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Riyadh",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export const riyadhTime = (at: Date) => riyadhClock.format(at);

export function sellerParty(company: Company): ZatcaParty {
  return {
    name: company.name,
    vatNumber: company.vatNumber,
    crNumber: company.crNumber,
    address: company.nationalAddress!,
  };
}

/** Company details needed before connecting to ZATCA, and on every document after that. */
export function companyBlockers(company: Company): string[] {
  const out: string[] = [];
  if (!/^3\d{13}3$/.test(company.vatNumber)) {
    out.push("a 15-digit VAT number on your company profile");
  }
  if (!/^\d{10}$/.test(company.crNumber)) {
    out.push("a 10-digit CR number on your company profile");
  }
  const address = nationalAddressProblems(company.nationalAddress);
  if (address.length) out.push(`your company's ${address.join(", ")}`);
  return out;
}

/** Reasons this document can't go to ZATCA yet. Empty means it can. */
export function zatcaBlockers(inv: Invoice, company: Company): string[] {
  const out = companyBlockers(company);
  if (inv.currency !== "SAR") {
    out.push("SAR as the currency (other currencies aren't supported for ZATCA yet)");
  }
  if (inv.items.some((it) => it.vatRate <= 0)) {
    out.push(
      "a VAT rate above 0% on every line (zero-rated and exempt lines aren't supported for ZATCA yet)",
    );
  }
  if (invoiceKind(inv) === "standard") {
    const address = nationalAddressProblems(inv.customerNationalAddress);
    if (address.length) out.push(`the customer's ${address.join(", ")}`);
  }
  return out;
}

export function toZatcaDocument(
  inv: Invoice,
  company: Company,
  chain: { uuid: string; icv: number; previousHash: string },
  originalNumber: string | null,
): ZatcaDocument {
  const kind = invoiceKind(inv);
  const credit = isCreditNote(inv);
  return {
    ...chain,
    number: inv.number,
    kind,
    type: credit ? "credit_note" : "invoice",
    issueDate: inv.date,
    issueTime: riyadhTime(new Date(inv.issuedAt!)),
    seller: sellerParty(company),
    buyer:
      kind === "standard"
        ? {
            name: inv.customerName,
            vatNumber: inv.customerVat,
            crNumber: "",
            address: inv.customerNationalAddress!,
          }
        : null,
    lines: inv.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount: it.discount,
      vatRate: it.vatRate,
    })),
    billingReference: credit ? (originalNumber ?? "") : undefined,
    reason: credit ? inv.reason : undefined,
  };
}

/** The QR ZATCA put in a cleared invoice, which replaces the one we generated. */
export function qrFromClearedXml(xml: string): string | null {
  const match = xml.match(
    /<cbc:ID>QR<\/cbc:ID>\s*<cac:Attachment>\s*<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)</,
  );
  return match?.[1].trim() ?? null;
}
