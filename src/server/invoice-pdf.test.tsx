import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Company, Invoice } from "@/lib/invoice-math";
import { renderInvoicePdf } from "./invoice-pdf.server";

const company: Company = {
  name: "Nawa Technologies LLC · شركة نوى للتقنية",
  logoUrl: "",
  vatNumber: "300777888900003",
  crNumber: "1010999888",
  address: "Olaya District, Riyadh 12213",
  bank: "Al Rajhi Bank · IBAN SA03 8000 0000 6080 1016 7519",
  email: "",
  phone: "",
  website: "",
  footer: "Thank you for your business",
  currency: "SAR",
  vatRate: 15,
};

const invoice: Invoice = {
  id: "11111111-1111-1111-1111-111111111111",
  documentType: "invoice",
  originalInvoiceId: null,
  reason: "",
  number: "INV-2026-1001",
  date: "2026-10-27",
  dueDate: "2026-11-26",
  customerId: null,
  customerName: "شركة الراجحي للتجارة Al Rajhi Trading",
  customerVat: "300123456700003",
  customerAddress: "King Fahd Rd, Riyadh 12345",
  currency: "SAR",
  items: [
    {
      id: "a",
      description: "Consulting services · خدمات استشارية",
      quantity: 40,
      unitPrice: 450,
      discount: 0,
      vatRate: 15,
    },
    {
      id: "b",
      description: "Software licence",
      quantity: 1,
      unitPrice: 12000,
      discount: 500,
      vatRate: 15,
    },
  ],
  status: "unpaid",
  notes: "",
  template: "bilingual",
  issuedAt: "2026-10-27T07:27:15Z",
};

async function pdfText(buf: Buffer) {
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: false }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  return { pages: doc.numPages, text: tc.items.map((i) => ("str" in i ? i.str : "")).join(" ") };
}

describe("invoice PDF", () => {
  it("renders a bilingual standard tax invoice with totals, VAT and issue time", async () => {
    const buf = await renderInvoicePdf(invoice, company);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");

    // Kept for visual review of Arabic rendering after font or library changes.
    mkdirSync("test-output", { recursive: true });
    writeFileSync("test-output/invoice-sample.pdf", buf);

    const { pages, text } = await pdfText(buf);
    expect(pages).toBe(1);
    expect(text).toContain("TAX INVOICE");
    expect(text).toContain("INV-2026-1001");
    expect(text).toContain("27/10/2026"); // day/month/year
    expect(text).toContain("10:27:15"); // Riyadh issue time of 07:27:15Z
    expect(text).toContain("300777888900003");
    expect(text).toContain("300123456700003");
    // 40 x 450 = 18,000 ; 12,000 - 500 = 11,500 ; subtotal 29,500 ; VAT 4,425 ; total 33,925
    expect(text).toContain("29,500.00");
    expect(text).toContain("4,425.00");
    expect(text).toContain("33,925.00");
    expect(text).not.toContain("DRAFT");
    expect(text).not.toContain("QR code unavailable");
  });

  it("marks drafts and explains a missing QR", async () => {
    const buf = await renderInvoicePdf(
      { ...invoice, status: "draft", issuedAt: null, customerVat: "" },
      { ...company, vatNumber: "" },
    );
    const { text } = await pdfText(buf);
    expect(text).toContain("DRAFT");
    expect(text).toContain("SIMPLIFIED TAX INVOICE");
    expect(text).toContain("QR code unavailable");
  });
});

describe("credit note PDF", () => {
  it("shows the credit note title, reference to the original invoice, reason and total", async () => {
    const note: Invoice = {
      ...invoice,
      id: "22222222-2222-2222-2222-222222222222",
      documentType: "credit_note",
      originalInvoiceId: invoice.id,
      reason: "Goods or services returned and accepted by the supplier",
      number: "CN-2026-1001",
      date: "2026-10-28",
      items: [invoice.items[0]],
      issuedAt: "2026-10-28T09:00:00Z",
    };
    const buf = await renderInvoicePdf(note, company, {
      number: "INV-2026-1001",
      date: "2026-10-27",
    });
    writeFileSync("test-output/credit-note-sample.pdf", buf);
    const { text } = await pdfText(buf);
    expect(text).toContain("CREDIT NOTE");
    expect(text).toContain("CN-2026-1001");
    // pdf.js adds spaces inside parentheses when extracting.
    expect(text).toMatch(
      /relates to invoice number \(\s*INV-2026-1001\s*\), issued on\s+27\/10\/2026/,
    );
    expect(text).toContain("returned and accepted");
    expect(text).toContain("Total credit amount");
    // 40 x 450 = 18,000 + 15% VAT = 20,700
    expect(text).toContain("20,700.00");
    expect(text).not.toContain("Payment due date");
  });
});

describe("repeated renders (regression)", () => {
  // react-pdf reused parsed fonts across documents and dropped glyphs in later renders:
  // every word-initial "ه" vanished from the second PDF in a process ("هيئة" became "يئة").
  it("keeps every letter in later and concurrent renders", async () => {
    const withHeh = (n: string): Invoice => ({
      ...invoice,
      number: n,
      customerName: "هيئة الزكاة",
      customerVat: "",
      items: [{ ...invoice.items[0], description: "هاتف محمول" }],
    });
    await renderInvoicePdf({ ...invoice, customerName: "شركة الراجحي" }, company);
    const [a, b] = await Promise.all([
      renderInvoicePdf(withHeh("INV-2026-2001"), company),
      renderInvoicePdf(withHeh("INV-2026-2002"), company),
    ]);
    for (const buf of [a, b]) {
      const { text } = await pdfText(buf);
      expect(text).toContain("هيئة");
      expect(text).toContain("هاتف");
    }
  });
});
