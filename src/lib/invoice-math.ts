// Pure, dependency-free invoice types and money math shared by client and server.

export type InvoiceStatus = "draft" | "paid" | "unpaid" | "overdue";
export type InvoiceTemplate = "modern" | "corporate" | "minimal" | "arabic" | "bilingual";
/** "credit_note" reduces a previously issued invoice (ZATCA Tax Invoicing Guideline s.7). */
export type DocumentType = "invoice" | "credit_note";

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
  documentType: DocumentType;
  /** For credit notes: the issued invoice being reduced. */
  originalInvoiceId: string | null;
  /** For credit notes: why it was issued (XML BR-KSA-17). */
  reason: string;
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

/** Issued documents are locked: content can't change, only payment status. */
export const isIssued = (inv: Pick<Invoice, "issuedAt">) => inv.issuedAt !== null;
export const isCreditNote = (inv: Pick<Invoice, "documentType">) =>
  inv.documentType === "credit_note";

/** Totals with credit notes negative, for revenue and VAT reporting. Drafts count as zero. */
export function signedTotals(inv: Invoice) {
  if (inv.status === "draft") return { subtotal: 0, vat: 0, total: 0 };
  const t = computeTotals(inv.items);
  const k = isCreditNote(inv) ? -1 : 1;
  return { subtotal: k * t.subtotal, vat: k * t.vat, total: k * t.total };
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

/**
 * Next number in a PREFIX-YYYY-NNNN sequence, based on the highest existing sequence among
 * documents of the same type. Invoices use "INV", credit notes "CN".
 */
export function nextInvoiceNumber(
  existing: Array<{ number: string; documentType?: DocumentType }>,
  year = new Date().getFullYear(),
  type: DocumentType = "invoice",
) {
  let max = 1000;
  for (const { number, documentType = "invoice" } of existing) {
    if (documentType !== type) continue;
    const m = number.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${type === "credit_note" ? "CN" : "INV"}-${year}-${max + 1}`;
}

/**
 * Revenue and VAT per month for the last `months` months, oldest first. Drafts are excluded and
 * credit notes are subtracted.
 */
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
    const b = byKey.get(inv.date.slice(0, 7));
    if (!b) continue;
    const t = signedTotals(inv);
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

/** Today's date in Saudi Arabia as YYYY-MM-DD, the same on the server (UTC) and in the browser. */
export function riyadhTodayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(now);
}

/** What the app shows: the stored status plus "credited" for invoices cancelled in full. */
export type DisplayStatus = InvoiceStatus | "credited";

export interface PaymentView {
  status: DisplayStatus;
  /** Total of issued credit notes against this invoice. */
  credited: number;
  /** What the customer still owes: unpaid or overdue invoices less credits; otherwise 0. */
  outstanding: number;
}

/**
 * Payment view of every document. The stored status only records what a person set (unpaid or
 * paid). Overdue (due date passed, Riyadh time) and credited (issued credit notes cover the full
 * total) are worked out here, so they can't go stale.
 */
export function paymentViews(docs: Invoice[], today: string): Map<string, PaymentView> {
  const credited = new Map<string, number>();
  for (const d of docs) {
    if (isCreditNote(d) && isIssued(d) && d.originalInvoiceId) {
      const prev = credited.get(d.originalInvoiceId) ?? 0;
      credited.set(d.originalInvoiceId, round2(prev + computeTotals(d.items).total));
    }
  }
  const views = new Map<string, PaymentView>();
  for (const d of docs) {
    // Credit notes and drafts keep their stored status ("overdue" was never valid for them).
    if (isCreditNote(d) || d.status === "draft") {
      views.set(d.id, { status: d.status, credited: 0, outstanding: 0 });
      continue;
    }
    const total = computeTotals(d.items).total;
    const c = credited.get(d.id) ?? 0;
    let status: DisplayStatus;
    if (c > 0 && c >= total) status = "credited";
    else if (d.status === "paid") status = "paid";
    else status = d.dueDate < today ? "overdue" : "unpaid";
    const owed = status === "unpaid" || status === "overdue";
    views.set(d.id, { status, credited: c, outstanding: owed ? round2(total - c) : 0 });
  }
  return views;
}
