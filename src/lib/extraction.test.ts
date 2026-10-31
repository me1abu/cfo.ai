import { describe, expect, it } from "vitest";
import {
  ExtractionSchema,
  checkExtractedInvoice,
  extractionToInvoice,
  type Extraction,
} from "./extraction";

const good: Extraction = {
  isInvoice: true,
  documentKind: "tax_invoice",
  language: "bilingual",
  invoiceNumber: "100",
  issueDate: "2026-10-20",
  dueDate: null,
  currency: "SAR",
  seller: {
    name: "Al Salam Supplies Co. Ltd",
    vatNumber: "310175397400003",
    crNumber: null,
    address: "Prince Sultan bin Abdulaziz Road, Riyadh",
  },
  buyer: {
    name: "Al Kawthar Markets",
    vatNumber: "300123456700003",
    crNumber: null,
    address: "Sa'ad bin Abdulrahman First Road, Riyadh",
  },
  lines: [
    { description: "Item A", quantity: 1, unitPrice: 200, discount: 0, vatRate: 15 },
    { description: "Item D", quantity: 2, unitPrice: 50, discount: 0, vatRate: 15 },
  ],
  statedTotals: { subtotal: 300, vat: 45, total: 345 },
  hasQrCode: true,
  notes: null,
  warnings: [],
};

const statusOf = (x: Extraction, id: string) =>
  checkExtractedInvoice(x, "2026-10-31").checks.find((c) => c.id === id)?.status;

describe("ExtractionSchema", () => {
  it("accepts a complete extraction", () => {
    expect(ExtractionSchema.safeParse(good).success).toBe(true);
  });
});

describe("extractionToInvoice", () => {
  it("maps the buyer to the customer and keeps line values", () => {
    const inv = extractionToInvoice(good, { currency: "SAR", vatRate: 15, today: "2026-10-31" });
    expect(inv.customerName).toBe("Al Kawthar Markets");
    expect(inv.customerVat).toBe("300123456700003");
    expect(inv.items).toHaveLength(2);
    expect(inv.date).toBe("2026-10-20");
    expect(inv.dueDate).toBe("2026-10-20");
    expect(inv.template).toBe("bilingual");
  });

  it("falls back to today when the date is missing or not ISO, and strips VAT spaces", () => {
    const inv = extractionToInvoice(
      {
        ...good,
        issueDate: "20/10/2026",
        buyer: { ...good.buyer, vatNumber: "300 1234 5670 0003" },
      },
      { currency: "SAR", vatRate: 15, today: "2026-10-31" },
    );
    expect(inv.date).toBe("2026-10-31");
    expect(inv.customerVat).toBe("300123456700003");
  });
});

describe("checkExtractedInvoice", () => {
  it("passes a consistent bilingual tax invoice with a QR code", () => {
    const r = checkExtractedInvoice(good, "2026-10-31");
    expect(r.counts.fail).toBe(0);
    expect(statusOf(good, "arithmetic")).toBe("pass");
    expect(statusOf(good, "qr")).toBe("pass");
  });

  it("fails when printed totals don't match the lines", () => {
    const bad = { ...good, statedTotals: { subtotal: 300, vat: 45, total: 355 } };
    const c = checkExtractedInvoice(bad, "2026-10-31").checks.find((x) => x.id === "arithmetic")!;
    expect(c.status).toBe("fail");
    expect(c.detail).toMatch(/total printed 355.00, lines add up to 345.00/);
  });

  it("fails documents that aren't invoices, without a QR, or English-only", () => {
    expect(statusOf({ ...good, isInvoice: false, documentKind: "quotation" }, "is-invoice")).toBe(
      "fail",
    );
    expect(statusOf({ ...good, hasQrCode: false }, "qr")).toBe("fail");
    expect(statusOf({ ...good, language: "english" }, "arabic")).toBe("fail");
  });

  it("warns when no totals could be read", () => {
    expect(
      statusOf({ ...good, statedTotals: { subtotal: null, vat: null, total: null } }, "arithmetic"),
    ).toBe("warn");
  });
});
