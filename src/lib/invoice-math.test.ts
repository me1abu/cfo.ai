import { describe, expect, it } from "vitest";
import { computeTotals, nextInvoiceNumber, round2 } from "./invoice-math";

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
