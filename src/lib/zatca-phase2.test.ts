import { describe, expect, it } from "vitest";
import type { Company, Invoice } from "./invoice-math";
import { nationalAddressProblems } from "./national-address";
import { companyBlockers, qrFromClearedXml, toZatcaDocument, zatcaBlockers } from "./zatca-phase2";
import { FIRST_PREVIOUS_HASH, documentTotals, renderInvoiceXml, xmlText } from "./zatca-xml";

const address = {
  street: "Prince Sultan",
  building: "2322",
  district: "Al-Murabba",
  city: "Riyadh",
  postalCode: "23333",
};

const company: Company = {
  name: "Nawa LLC",
  logoUrl: "",
  vatNumber: "399999999900003",
  crNumber: "1010010000",
  address: "",
  nationalAddress: address,
  bank: "",
  email: "",
  phone: "",
  website: "",
  footer: "",
  currency: "SAR",
  vatRate: 15,
};

const invoice: Invoice = {
  id: "1",
  documentType: "invoice",
  originalInvoiceId: null,
  reason: "",
  number: "INV-1",
  date: "2026-11-07",
  dueDate: "2026-12-07",
  customerId: null,
  customerName: "Buyer & Sons",
  customerVat: "399999999800003",
  customerAddress: "",
  customerNationalAddress: address,
  currency: "SAR",
  items: [{ id: "a", description: "x", quantity: 2, unitPrice: 100, discount: 10, vatRate: 15 }],
  status: "unpaid",
  notes: "",
  template: "bilingual",
  issuedAt: "2026-11-07T07:15:30.000Z",
};

const chain = { uuid: "u", icv: 7, previousHash: FIRST_PREVIOUS_HASH };

describe("zatcaBlockers", () => {
  it("passes a complete standard invoice", () => {
    expect(zatcaBlockers(invoice, company)).toEqual([]);
  });

  it("names everything that's missing", () => {
    const out = zatcaBlockers(
      {
        ...invoice,
        currency: "USD",
        customerNationalAddress: null,
        items: [{ ...invoice.items[0], vatRate: 0 }],
      },
      { ...company, crNumber: "" },
    );
    expect(out).toHaveLength(4);
  });

  it("doesn't ask for a buyer address on simplified invoices", () => {
    const simplified = { ...invoice, customerVat: "", customerNationalAddress: null };
    expect(zatcaBlockers(simplified, company)).toEqual([]);
  });
});

describe("companyBlockers and addresses", () => {
  it("requires VAT, CR and a National Address", () => {
    const empty = { ...company, vatNumber: "", crNumber: "", nationalAddress: null };
    expect(companyBlockers(empty)).toHaveLength(3);
  });

  it("checks building and postal code formats", () => {
    expect(nationalAddressProblems({ ...address, building: "12", postalCode: "1" })).toEqual([
      "4-digit building number",
      "5-digit postal code",
    ]);
  });
});

describe("toZatcaDocument", () => {
  it("uses Saudi time, and only includes a buyer on standard invoices", () => {
    const doc = toZatcaDocument(invoice, company, chain, null);
    expect(doc.issueTime).toBe("10:15:30");
    expect(doc.kind).toBe("standard");
    expect(doc.buyer?.name).toBe("Buyer & Sons");
    const simplified = toZatcaDocument({ ...invoice, customerVat: "" }, company, chain, null);
    expect(simplified.kind).toBe("simplified");
    expect(simplified.buyer).toBeNull();
  });

  it("references the original invoice and reason on credit notes", () => {
    const doc = toZatcaDocument(
      { ...invoice, documentType: "credit_note", originalInvoiceId: "o", reason: "Returned" },
      company,
      chain,
      "INV-0",
    );
    expect(doc.type).toBe("credit_note");
    expect(doc.billingReference).toBe("INV-0");
    expect(doc.reason).toBe("Returned");
  });
});

describe("renderInvoiceXml", () => {
  const doc = toZatcaDocument(invoice, company, chain, null);

  it("matches the app's totals, discount included", () => {
    const t = documentTotals(doc.lines);
    expect(t).toMatchObject({ net: 190, vat: 28.5, total: 218.5 });
  });

  it("leaves signature parts out of the text that gets hashed", () => {
    const xml = renderInvoiceXml(doc);
    expect(xml).not.toContain("UBLExtensions>");
    expect(xml).not.toContain("<cac:Signature>");
    expect(xml).not.toContain("<cbc:ID>QR</cbc:ID>");
    expect(xml.startsWith("<Invoice ")).toBe(true);
  });

  it("adds signature parts without changing anything else", () => {
    const pure = renderInvoiceXml(doc);
    const signed = renderInvoiceXml(doc, { extensions: "<ext:UBLExtensions/>", qr: "QRDATA" });
    const stripped = signed
      .replace('<?xml version="1.0" encoding="UTF-8"?>\n', "")
      .replace("<ext:UBLExtensions/>", "")
      .replace(
        /<cac:AdditionalDocumentReference><cbc:ID>QR<\/cbc:ID>.*?<\/cac:AdditionalDocumentReference>/,
        "",
      )
      .replace(/<cac:Signature>.*?<\/cac:Signature>/, "");
    expect(stripped).toBe(pure);
  });

  it("escapes text as C14N does, with no whitespace between elements", () => {
    const xml = renderInvoiceXml(doc);
    expect(xml).toContain("Buyer &amp; Sons");
    expect(xml).not.toMatch(/>\s+</);
    expect(xmlText("a<b>\r")).toBe("a&lt;b&gt;&#xD;");
  });
});

describe("qrFromClearedXml", () => {
  it("finds ZATCA's QR in a stamped invoice, spaced or not", () => {
    const xml = `<cac:AdditionalDocumentReference>
      <cbc:ID>QR</cbc:ID>
      <cac:Attachment>
        <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">ABC=</cbc:EmbeddedDocumentBinaryObject>
      </cac:Attachment></cac:AdditionalDocumentReference>`;
    expect(qrFromClearedXml(xml)).toBe("ABC=");
    expect(qrFromClearedXml("<x/>")).toBeNull();
  });
});
