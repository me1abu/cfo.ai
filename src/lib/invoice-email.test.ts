import { describe, expect, it } from "vitest";
import { invoiceEmailContent, senderHeader } from "./invoice-email";
import type { Invoice } from "./invoice-math";

const inv: Invoice = {
  id: "1",
  documentType: "invoice",
  originalInvoiceId: null,
  reason: "",
  number: "INV-2026-1001",
  date: "2026-10-01",
  dueDate: "2026-10-31",
  customerId: null,
  customerName: "Al Rajhi Trading",
  customerVat: "300123456700003",
  customerAddress: "Riyadh",
  currency: "SAR",
  items: [{ id: "1", description: "x", quantity: 1, unitPrice: 1000, discount: 0, vatRate: 15 }],
  status: "unpaid",
  notes: "",
  template: "bilingual",
  issuedAt: "2026-10-01T08:00:00Z",
};

describe("senderHeader", () => {
  it("uses the company name at the verified address", () => {
    expect(senderHeader("Nawa LLC", "AI Invoice <noreply@fynlet.com>")).toBe(
      '"Nawa LLC" <noreply@fynlet.com>',
    );
    expect(senderHeader("Nawa", "noreply@fynlet.com")).toBe('"Nawa" <noreply@fynlet.com>');
  });

  it("can't be broken out of by the company name", () => {
    expect(senderHeader('Evil" <x@y.z>\r\nBcc: a@b.c', "n@fynlet.com")).toBe(
      '"Evil x@y.zBcc: a@b.c" <n@fynlet.com>',
    );
    expect(senderHeader("", "n@fynlet.com")).toBe("n@fynlet.com");
  });
});

describe("invoiceEmailContent", () => {
  it("states the document, amount and due date in both languages", () => {
    const { subject, text } = invoiceEmailContent(inv, "Nawa LLC");
    expect(subject).toContain("INV-2026-1001 from Nawa LLC");
    expect(text).toContain("Due date: 2026-10-31");
    expect(text).toContain("تاريخ الاستحقاق: 2026-10-31");
  });

  it("leaves the due date off credit notes", () => {
    const { subject, text } = invoiceEmailContent(
      { ...inv, documentType: "credit_note", originalInvoiceId: "x" },
      "Nawa LLC",
    );
    expect(subject).toContain("Credit Note");
    expect(text).not.toContain("Due date");
  });
});
