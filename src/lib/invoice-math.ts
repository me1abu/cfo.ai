// Pure, dependency-free invoice types and money math shared by client and server.

export type InvoiceStatus = "draft" | "paid" | "unpaid" | "overdue";
export type InvoiceTemplate = "modern" | "corporate" | "minimal" | "arabic" | "bilingual";

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatRate: number;
}

export interface Invoice {
  id: string;
  number: string;
  date: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  customerId: string | null;
  customerName: string;
  customerVat: string;
  customerAddress: string;
  currency: string;
  items: InvoiceItem[];
  status: InvoiceStatus;
  notes: string;
  template: InvoiceTemplate;
  /** ISO timestamp set by the server when the invoice first leaves draft; null for drafts. */
  issuedAt: string | null;
}

export interface Customer {
  id: string;
  name: string;
  vatNumber: string;
  crNumber: string;
  address: string;
  email: string;
  phone: string;
  notes: string;
}

export interface Company {
  name: string;
  logoUrl: string;
  vatNumber: string;
  crNumber: string;
  address: string;
  bank: string;
  email: string;
  phone: string;
  website: string;
  footer: string;
  currency: string;
  vatRate: number;
}

export interface UserSettings {
  fullName: string;
  email: string;
  language: "en" | "ar";
  theme: "light" | "dark";
  emailNotifs: boolean;
  smsNotifs: boolean;
}

/** Rounds to 2 dp using integer arithmetic to avoid 0.1 + 0.2 style drift. */
export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineSubtotal(it: Pick<InvoiceItem, "quantity" | "unitPrice" | "discount">) {
  return round2(it.quantity * it.unitPrice - it.discount);
}

export function computeTotals(items: InvoiceItem[]) {
  let subtotal = 0;
  let vat = 0;
  for (const it of items) {
    const line = lineSubtotal(it);
    subtotal += line;
    vat += round2(line * (it.vatRate / 100));
  }
  subtotal = round2(subtotal);
  vat = round2(vat);
  return { subtotal, vat, total: round2(subtotal + vat) };
}

export function formatMoney(n: number, currency = "SAR") {
  return `${currency} ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Next number in the INV-YYYY-NNNN sequence, based on the highest existing sequence. */
export function nextInvoiceNumber(
  existing: Array<{ number: string }>,
  year = new Date().getFullYear(),
) {
  let max = 1000;
  for (const { number } of existing) {
    const m = number.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `INV-${year}-${max + 1}`;
}

/** Revenue and VAT totals per month for the last `months` months, oldest first. Drafts excluded. */
export function monthlySeries(invoices: Invoice[], months = 6, now = new Date()) {
  const buckets: { key: string; month: string; revenue: number; vat: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      month: d.toLocaleString("en-US", { month: "short" }),
      revenue: 0,
      vat: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const inv of invoices) {
    if (inv.status === "draft") continue;
    const b = byKey.get(inv.date.slice(0, 7));
    if (!b) continue;
    const t = computeTotals(inv.items);
    b.revenue = round2(b.revenue + t.total);
    b.vat = round2(b.vat + t.vat);
  }
  return buckets;
}

/** Local calendar date as YYYY-MM-DD (not UTC, so it matches what the user sees). */
export function toLocalISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO() {
  return toLocalISODate(new Date());
}

export function plusDaysISO(days: number, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}
