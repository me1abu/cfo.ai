import { describe, expect, it } from "vitest";
import {
  computeTotals,
  monthlySeries,
  nextInvoiceNumber,
  round2,
  signedTotals,
  type Invoice,
} from "./invoice-math";

describe("computeTotals", () => {
  it("applies line discounts before VAT", () => {
    const t = computeTotals([
      { id: "a", description: "x", quantity: 2, unitPrice: 100, discount: 50, vatRate: 15 },
    ]);
    expect(t).toEqual({ subtotal: 150, vat: 22.5, total: 172.5 });
  });

  it("supports mixed VAT rates per line", () => {
    const t = computeTotals([
      { id: "a", description: "std", quantity: 1, unitPrice: 100, discount: 0, vatRate: 15 },
      { id: "b", description: "zero", quantity: 1, unitPrice: 100, discount: 0, vatRate: 0 },
    ]);
    expect(t).toEqual({ subtotal: 200, vat: 15, total: 215 });
  });

  it("rounds to 2 dp without floating drift", () => {
    const t = computeTotals([
      { id: "a", description: "x", quantity: 3, unitPrice: 0.1, discount: 0, vatRate: 15 },
    ]);
    expect(t.subtotal).toBe(0.3);
    expect(t.vat).toBe(0.05);
    expect(t.total).toBe(0.35);
    expect(round2(1.005)).toBe(1.01);
  });
});

describe("nextInvoiceNumber", () => {
  it("increments from the highest existing sequence", () => {
    expect(
      nextInvoiceNumber([{ number: "INV-2025-1007" }, { number: "INV-2025-1003" }], 2026),
    ).toBe("INV-2026-1008");
  });
  it("starts at 1001 for an empty workspace", () => {
    expect(nextInvoiceNumber([], 2026)).toBe("INV-2026-1001");
  });
});

describe("credit notes in numbering and reporting", () => {
  const doc = (
    number: string,
    documentType: "invoice" | "credit_note",
    status: "draft" | "unpaid" = "unpaid",
  ): Invoice => ({
    id: number,
    documentType,
    originalInvoiceId: documentType === "credit_note" ? "x" : null,
    reason: "",
    number,
    date: "2026-10-05",
    dueDate: "2026-10-05",
    customerId: null,
    customerName: "C",
    customerVat: "",
    customerAddress: "",
    currency: "SAR",
    items: [
      {
        id: "1",
        description: "x",
        quantity: 1,
        unitPrice: documentType === "credit_note" ? 100 : 1000,
        discount: 0,
        vatRate: 15,
      },
    ],
    status,
    notes: "",
    template: "bilingual",
    issuedAt: status === "draft" ? null : "2026-10-05T08:00:00Z",
  });

  it("numbers invoices and credit notes in separate sequences", () => {
    const docs = [doc("INV-2026-1005", "invoice"), doc("CN-2026-1002", "credit_note")];
    expect(nextInvoiceNumber(docs, 2026)).toBe("INV-2026-1006");
    expect(nextInvoiceNumber(docs, 2026, "credit_note")).toBe("CN-2026-1003");
  });

  it("subtracts credit notes and ignores drafts", () => {
    expect(signedTotals(doc("CN-1", "credit_note")).total).toBe(-115);
    expect(signedTotals(doc("INV-1", "invoice", "draft")).total).toBe(0);
    const series = monthlySeries(
      [doc("INV-1", "invoice"), doc("CN-1", "credit_note"), doc("INV-2", "invoice", "draft")],
      1,
      new Date(2026, 9, 27),
    );
    expect(series[0]).toMatchObject({ revenue: 1035, vat: 135 });
  });
});
