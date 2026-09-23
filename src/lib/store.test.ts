import { describe, expect, it } from "vitest";
import { computeTotals, nextInvoiceNumber, type Invoice } from "./store";

describe("computeTotals", () => {
  it("applies line discounts before VAT", () => {
    const t = computeTotals([
      { id: "a", description: "x", quantity: 2, unitPrice: 100, discount: 50, vatRate: 15 },
    ]);
    expect(t.subtotal).toBe(150);
    expect(t.vat).toBeCloseTo(22.5);
    expect(t.total).toBeCloseTo(172.5);
  });

  it("supports mixed VAT rates per line", () => {
    const t = computeTotals([
      { id: "a", description: "std", quantity: 1, unitPrice: 100, discount: 0, vatRate: 15 },
      { id: "b", description: "zero", quantity: 1, unitPrice: 100, discount: 0, vatRate: 0 },
    ]);
    expect(t.vat).toBe(15);
    expect(t.total).toBe(215);
  });
});

describe("nextInvoiceNumber", () => {
  it("increments from the highest existing number", () => {
    const invoices = [{ number: "INV-2025-1007" }, { number: "INV-2025-1003" }] as Invoice[];
    expect(nextInvoiceNumber(invoices)).toBe(`INV-${new Date().getFullYear()}-1008`);
  });
});
