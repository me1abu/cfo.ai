import { describe, expect, it } from "vitest";
import type { Company, Invoice } from "./invoice-math";
import { invoiceKind, isValidSaudiVatNumber, validateInvoice } from "./zatca-rules";

const company: Company = {
  name: "Nawa Technologies LLC",
  logoUrl: "",
  vatNumber: "300777888900003",
  crNumber: "1010999888",
  address: "Olaya District, Riyadh 12213",
  bank: "",
  email: "",
  phone: "",
  website: "",
  footer: "",
  currency: "SAR",
  vatRate: 15,
};

const invoice = (patch: Partial<Invoice> = {}): Invoice => ({
  id: "x",
  number: "INV-2026-1001",
  date: "2026-10-20",
  dueDate: "2026-11-19",
  customerId: null,
  customerName: "Al Rajhi Trading Co.",
  customerVat: "300123456700003",
  customerAddress: "King Fahd Rd, Riyadh 12345",
  currency: "SAR",
  items: [
    { id: "1", description: "Consulting", quantity: 40, unitPrice: 450, discount: 0, vatRate: 15 },
  ],
  status: "unpaid",
  notes: "",
  template: "bilingual",
  issuedAt: "2026-10-20T07:00:00Z",
  ...patch,
});

const run = (inv: Invoice, co = company) => validateInvoice(inv, co, { today: "2026-10-27" });
const statusOf = (inv: Invoice, id: string, co = company) =>
  run(inv, co).checks.find((c) => c.id === id)?.status;

describe("isValidSaudiVatNumber (BR-KSA-40/44)", () => {
  it("accepts 15 digits starting and ending with 3", () => {
    expect(isValidSaudiVatNumber("310122393500003")).toBe(true);
    expect(isValidSaudiVatNumber(" 300777888900003 ")).toBe(true);
  });
  it("rejects other shapes", () => {
    expect(isValidSaudiVatNumber("100025906700003")).toBe(false); // starts with 1
    expect(isValidSaudiVatNumber("310122393500001")).toBe(false); // ends with 1
    expect(isValidSaudiVatNumber("31012239350003")).toBe(false); // 14 digits
    expect(isValidSaudiVatNumber("3101223935000a3")).toBe(false);
  });
});

describe("validateInvoice", () => {
  it("a complete standard invoice is ready with no warnings", () => {
    const r = run(invoice());
    expect(r.kind).toBe("standard");
    expect(r.ready).toBe(true);
    expect(r.counts.fail).toBe(0);
    expect(r.counts.warn).toBe(0);
  });

  it("fails without seller VAT number, and the QR check fails too", () => {
    const r = run(invoice(), { ...company, vatNumber: "" });
    expect(r.ready).toBe(false);
    expect(r.checks.find((c) => c.id === "seller-vat")?.status).toBe("fail");
    expect(r.checks.find((c) => c.id === "qr")?.status).toBe("fail");
  });

  it("fails a malformed seller or customer VAT number", () => {
    expect(statusOf(invoice(), "seller-vat", { ...company, vatNumber: "123" })).toBe("fail");
    expect(statusOf(invoice({ customerVat: "123456789012345" }), "customer-vat")).toBe("fail");
  });

  it("standard invoices need customer name and address", () => {
    expect(statusOf(invoice({ customerAddress: "" }), "customer-address")).toBe("fail");
  });

  it("no customer VAT means simplified; customer address is then not required", () => {
    const small = invoice({
      customerVat: "",
      customerAddress: "",
      items: [
        { id: "1", description: "Coffee", quantity: 2, unitPrice: 20, discount: 0, vatRate: 15 },
      ],
    });
    const r = run(small);
    expect(invoiceKind(small)).toBe("simplified");
    expect(r.checks.find((c) => c.id === "customer-address")).toBeUndefined();
    expect(r.checks.find((c) => c.id === "invoice-type")?.status).toBe("pass");
    expect(r.ready).toBe(true);
  });

  it("warns on a simplified invoice of SAR 1,000 or more", () => {
    expect(statusOf(invoice({ customerVat: "" }), "invoice-type")).toBe("warn");
  });

  it("fails non-SAR currency (VAT must be stated in SAR)", () => {
    expect(statusOf(invoice({ currency: "USD" }), "currency")).toBe("fail");
  });

  it("fails English-only templates (Arabic required)", () => {
    expect(statusOf(invoice({ template: "modern" }), "arabic")).toBe("fail");
    expect(statusOf(invoice({ template: "arabic" }), "arabic")).toBe("pass");
  });

  it("fails bad lines: missing description, zero quantity, discount above value", () => {
    const bad = invoice({
      items: [
        { id: "1", description: "", quantity: 1, unitPrice: 10, discount: 0, vatRate: 15 },
        { id: "2", description: "B", quantity: 0, unitPrice: 10, discount: 0, vatRate: 15 },
        { id: "3", description: "C", quantity: 1, unitPrice: 10, discount: 20, vatRate: 15 },
      ],
    });
    const c = run(bad).checks.find((x) => x.id === "lines")!;
    expect(c.status).toBe("fail");
    expect(c.detail).toMatch(/line 1 has no description/);
    expect(c.detail).toMatch(/line 2 has no quantity/);
    expect(c.detail).toMatch(/line 3's discount exceeds its value/);
  });

  it("warns on 0% lines without a statement, passes with one", () => {
    const zero = (notes: string) =>
      invoice({
        notes,
        items: [
          { id: "1", description: "Export", quantity: 1, unitPrice: 1000, discount: 0, vatRate: 0 },
        ],
      });
    expect(statusOf(zero(""), "vat-rate")).toBe("warn");
    expect(statusOf(zero("Zero-rated export of goods"), "vat-rate")).toBe("pass");
  });

  it("warns on non-standard rates such as the old 5%", () => {
    const five = invoice({
      items: [{ id: "1", description: "X", quantity: 1, unitPrice: 100, discount: 0, vatRate: 5 }],
    });
    expect(statusOf(five, "vat-rate")).toBe("warn");
  });

  it("warns on a future issue date and on due date before issue date", () => {
    expect(statusOf(invoice({ date: "2026-12-01", dueDate: "2026-12-31" }), "issue-date")).toBe(
      "warn",
    );
    expect(statusOf(invoice({ dueDate: "2026-10-01" }), "due-date")).toBe("warn");
  });
});
