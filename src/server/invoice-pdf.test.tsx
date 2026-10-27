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
