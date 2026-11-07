// UBL 2.1 invoice XML for ZATCA Phase 2. Pure, so it runs in tests and on the server.
//
// The XML is written with no whitespace between elements and with attributes in sorted order,
// which is already its C14N form. That matters because ZATCA recomputes the invoice hash from
// the document: with nothing for a canonicalizer to change, the hash we sign is the hash it finds.

import { round2, type NationalAddress } from "./invoice-math";

export const FIRST_PREVIOUS_HASH =
  "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";

export interface ZatcaParty {
  name: string;
  vatNumber: string;
  crNumber: string;
  address: NationalAddress;
}

export interface ZatcaLine {
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatRate: number;
}

export interface ZatcaDocument {
  uuid: string;
  number: string;
  /** Invoice counter value, per EGS unit (KSA-16). */
  icv: number;
  /** Hash of the previous document from this EGS unit (KSA-13). */
  previousHash: string;
  kind: "standard" | "simplified";
  type: "invoice" | "credit_note" | "debit_note";
  issueDate: string;
  /** HH:MM:SS */
  issueTime: string;
  seller: ZatcaParty;
  /** Required for standard invoices; a simplified invoice has no buyer. */
  buyer: ZatcaParty | null;
  lines: ZatcaLine[];
  /** Credit and debit notes: number of the invoice being amended (BR-KSA-56). */
  billingReference?: string;
  /** Credit and debit notes: why it was issued (BR-KSA-17). */
  reason?: string;
}

const NAMESPACES =
  'xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ' +
  'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ' +
  'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" ' +
  'xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"';

/** Escapes text the way C14N does. */
export const xmlText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");

const money = (n: number) => n.toFixed(2);

function el(name: string, content: string, attrs?: string) {
  return `<${name}${attrs ? ` ${attrs}` : ""}>${content}</${name}>`;
}
const cbc = (name: string, value: string, attrs?: string) =>
  el(`cbc:${name}`, xmlText(value), attrs);
const amount = (name: string, n: number) => cbc(name, money(n), 'currencyID="SAR"');

const VAT_SCHEME = el("cac:TaxScheme", cbc("ID", "VAT"));

function party(p: ZatcaParty) {
  const a = p.address;
  const id = p.crNumber
    ? el("cac:PartyIdentification", cbc("ID", p.crNumber, 'schemeID="CRN"'))
    : "";
  return el(
    "cac:Party",
    id +
      el(
        "cac:PostalAddress",
        cbc("StreetName", a.street) +
          cbc("BuildingNumber", a.building) +
          cbc("CitySubdivisionName", a.district) +
          cbc("CityName", a.city) +
          cbc("PostalZone", a.postalCode) +
          el("cac:Country", cbc("IdentificationCode", "SA")),
      ) +
      (p.vatNumber
        ? el("cac:PartyTaxScheme", cbc("CompanyID", p.vatNumber) + VAT_SCHEME)
        : el("cac:PartyTaxScheme", VAT_SCHEME)) +
      el("cac:PartyLegalEntity", cbc("RegistrationName", p.name)),
  );
}

export interface LineTotals {
  net: number;
  vat: number;
}

/** Same rounding as computeTotals: discount per line, then VAT per line to the halala. */
export function lineTotals(l: ZatcaLine): LineTotals {
  const net = round2(l.quantity * l.unitPrice - l.discount);
  return { net, vat: round2((net * l.vatRate) / 100) };
}

export function documentTotals(lines: ZatcaLine[]) {
  let net = 0;
  let vat = 0;
  const byRate = new Map<number, { taxable: number; vat: number }>();
  for (const l of lines) {
    const t = lineTotals(l);
    net = round2(net + t.net);
    vat = round2(vat + t.vat);
    const r = byRate.get(l.vatRate) ?? { taxable: 0, vat: 0 };
    byRate.set(l.vatRate, { taxable: round2(r.taxable + t.net), vat: round2(r.vat + t.vat) });
  }
  return { net, vat, total: round2(net + vat), byRate };
}

function taxCategory(rate: number) {
  return el(
    "cac:TaxCategory",
    cbc("ID", "S", 'schemeAgencyID="6" schemeID="UN/ECE 5305"') +
      cbc("Percent", money(rate)) +
      el("cac:TaxScheme", cbc("ID", "VAT", 'schemeAgencyID="6" schemeID="UN/ECE 5153"')),
  );
}

function invoiceLine(l: ZatcaLine, index: number) {
  const t = lineTotals(l);
  const allowance =
    l.discount > 0
      ? el(
          "cac:AllowanceCharge",
          cbc("ChargeIndicator", "false") +
            cbc("AllowanceChargeReason", "discount") +
            amount("Amount", l.discount),
        )
      : "";
  return el(
    "cac:InvoiceLine",
    cbc("ID", String(index + 1)) +
      cbc("InvoicedQuantity", String(l.quantity), 'unitCode="PCE"') +
      amount("LineExtensionAmount", t.net) +
      allowance +
      el(
        "cac:TaxTotal",
        amount("TaxAmount", t.vat) + amount("RoundingAmount", round2(t.net + t.vat)),
      ) +
      el(
        "cac:Item",
        cbc("Name", l.description) +
          el(
            "cac:ClassifiedTaxCategory",
            cbc("ID", "S") + cbc("Percent", money(l.vatRate)) + VAT_SCHEME,
          ),
      ) +
      el("cac:Price", amount("PriceAmount", l.unitPrice)),
  );
}

const attachment = (value: string) =>
  el("cac:Attachment", cbc("EmbeddedDocumentBinaryObject", value, 'mimeCode="text/plain"'));

export const SIGNATURE_METHOD = "urn:oasis:names:specification:ubl:dsig:enveloped:xades";

/**
 * Renders the document. Without `signed` this is the text ZATCA hashes: no UBLExtensions, QR
 * reference or cac:Signature. With it, those three are added and the rest stays byte-identical.
 */
export function renderInvoiceXml(
  doc: ZatcaDocument,
  signed?: { extensions: string; qr: string },
): string {
  const totals = documentTotals(doc.lines);
  const typeCode = { invoice: "388", credit_note: "381", debit_note: "383" }[doc.type];
  const subtype = doc.kind === "standard" ? "0100000" : "0200000";

  const billing =
    doc.type !== "invoice"
      ? el(
          "cac:BillingReference",
          el("cac:InvoiceDocumentReference", cbc("ID", doc.billingReference ?? "")),
        )
      : "";

  const subtotals = [...totals.byRate.entries()]
    .map(([rate, t]) =>
      el(
        "cac:TaxSubtotal",
        amount("TaxableAmount", t.taxable) + amount("TaxAmount", t.vat) + taxCategory(rate),
      ),
    )
    .join("");

  const paymentMeans = el(
    "cac:PaymentMeans",
    cbc("PaymentMeansCode", "30") +
      (doc.type !== "invoice" ? cbc("InstructionNote", doc.reason ?? "") : ""),
  );

  const body =
    cbc("ProfileID", "reporting:1.0") +
    cbc("ID", doc.number) +
    cbc("UUID", doc.uuid) +
    cbc("IssueDate", doc.issueDate) +
    cbc("IssueTime", doc.issueTime) +
    cbc("InvoiceTypeCode", typeCode, `name="${subtype}"`) +
    cbc("DocumentCurrencyCode", "SAR") +
    cbc("TaxCurrencyCode", "SAR") +
    billing +
    el("cac:AdditionalDocumentReference", cbc("ID", "ICV") + cbc("UUID", String(doc.icv))) +
    el("cac:AdditionalDocumentReference", cbc("ID", "PIH") + attachment(doc.previousHash)) +
    (signed
      ? el("cac:AdditionalDocumentReference", cbc("ID", "QR") + attachment(signed.qr)) +
        el(
          "cac:Signature",
          cbc("ID", "urn:oasis:names:specification:ubl:signature:Invoice") +
            cbc("SignatureMethod", SIGNATURE_METHOD),
        )
      : "") +
    el("cac:AccountingSupplierParty", party(doc.seller)) +
    el("cac:AccountingCustomerParty", doc.buyer ? party(doc.buyer) : "") +
    (doc.kind === "standard" ? el("cac:Delivery", cbc("ActualDeliveryDate", doc.issueDate)) : "") +
    paymentMeans +
    el("cac:TaxTotal", amount("TaxAmount", totals.vat)) +
    el("cac:TaxTotal", amount("TaxAmount", totals.vat) + subtotals) +
    el(
      "cac:LegalMonetaryTotal",
      amount("LineExtensionAmount", totals.net) +
        amount("TaxExclusiveAmount", totals.net) +
        amount("TaxInclusiveAmount", totals.total) +
        amount("AllowanceTotalAmount", 0) +
        amount("PrepaidAmount", 0) +
        amount("PayableAmount", totals.total),
    ) +
    doc.lines.map(invoiceLine).join("");

  const root = `<Invoice ${NAMESPACES}>${signed ? signed.extensions : ""}${body}</Invoice>`;
  return signed ? `<?xml version="1.0" encoding="UTF-8"?>\n${root}` : root;
}
