import { useSyncExternalStore } from "react";

export type InvoiceStatus = "draft" | "paid" | "unpaid" | "overdue";

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
  date: string;
  dueDate: string;
  customerId: string;
  customerName: string;
  customerVat: string;
  customerAddress: string;
  currency: string;
  items: InvoiceItem[];
  status: InvoiceStatus;
  notes?: string;
  template: "modern" | "corporate" | "minimal" | "arabic" | "bilingual";
}

export interface Customer {
  id: string;
  name: string;
  vatNumber: string;
  crNumber: string;
  address: string;
  email: string;
  phone: string;
  notes?: string;
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

export interface Settings {
  language: "en" | "ar";
  theme: "light" | "dark";
  emailNotifs: boolean;
  smsNotifs: boolean;
  twoFactor: boolean;
}

export interface AuthUser {
  email: string;
  name: string;
  verified: boolean;
}

interface AppState {
  auth: { user: AuthUser | null };
  invoices: Invoice[];
  customers: Customer[];
  company: Company;
  settings: Settings;
}

const STORAGE_KEY = "ai-invoice-sa-v1";

const sampleCustomers: Customer[] = [
  { id: "c1", name: "Al Rajhi Trading Co.", vatNumber: "300123456700003", crNumber: "1010123456", address: "King Fahd Rd, Riyadh 12345", email: "accounts@alrajhi-trading.sa", phone: "+966 11 234 5678", notes: "Preferred client, NET 30" },
  { id: "c2", name: "Jeddah Logistics Ltd.", vatNumber: "300987654300003", crNumber: "4030876543", address: "Prince Sultan St, Jeddah 21432", email: "finance@jed-logistics.sa", phone: "+966 12 665 4321" },
  { id: "c3", name: "Dammam Steel Industries", vatNumber: "300555444300003", crNumber: "2050554432", address: "Industrial City 2, Dammam 31411", email: "ap@dammamsteel.sa", phone: "+966 13 812 9900" },
  { id: "c4", name: "Makkah Hospitality Group", vatNumber: "300111222300003", crNumber: "4031112223", address: "Ibrahim Al Khalil Rd, Makkah 24231", email: "invoices@makkah-hg.sa", phone: "+966 12 550 1122" },
  { id: "c5", name: "NEOM Consulting", vatNumber: "300333222100003", crNumber: "7010332221", address: "The Line, NEOM", email: "billing@neom-consult.sa", phone: "+966 50 100 2000" },
];

function makeItems(rows: Array<[string, number, number, number]>): InvoiceItem[] {
  return rows.map((r, i) => ({
    id: `it_${Math.random().toString(36).slice(2, 8)}_${i}`,
    description: r[0],
    quantity: r[1],
    unitPrice: r[2],
    discount: r[3],
    vatRate: 15,
  }));
}

const sampleInvoices: Invoice[] = [
  {
    id: "inv_1001", number: "INV-2025-1001", date: "2025-10-04", dueDate: "2025-11-03",
    customerId: "c1", customerName: "Al Rajhi Trading Co.", customerVat: "300123456700003",
    customerAddress: "King Fahd Rd, Riyadh 12345", currency: "SAR",
    items: makeItems([["Consulting services — October", 40, 450, 0], ["Software license (annual)", 1, 12000, 500]]),
    status: "paid", template: "modern",
  },
  {
    id: "inv_1002", number: "INV-2025-1002", date: "2025-10-11", dueDate: "2025-11-10",
    customerId: "c2", customerName: "Jeddah Logistics Ltd.", customerVat: "300987654300003",
    customerAddress: "Prince Sultan St, Jeddah 21432", currency: "SAR",
    items: makeItems([["Logistics platform setup", 1, 28500, 0], ["Training (3 days)", 3, 3200, 0]]),
    status: "unpaid", template: "corporate",
  },
  {
    id: "inv_1003", number: "INV-2025-1003", date: "2025-10-18", dueDate: "2025-10-25",
    customerId: "c3", customerName: "Dammam Steel Industries", customerVat: "300555444300003",
    customerAddress: "Industrial City 2, Dammam 31411", currency: "SAR",
    items: makeItems([["Steel inspection audit", 1, 18000, 0]]),
    status: "overdue", template: "minimal",
  },
  {
    id: "inv_1004", number: "INV-2025-1004", date: "2025-11-01", dueDate: "2025-12-01",
    customerId: "c4", customerName: "Makkah Hospitality Group", customerVat: "300111222300003",
    customerAddress: "Ibrahim Al Khalil Rd, Makkah 24231", currency: "SAR",
    items: makeItems([["Guest management SaaS — Nov", 1, 8500, 0], ["Onboarding hours", 12, 550, 200]]),
    status: "paid", template: "bilingual",
  },
  {
    id: "inv_1005", number: "INV-2025-1005", date: "2025-11-08", dueDate: "2025-12-08",
    customerId: "c5", customerName: "NEOM Consulting", customerVat: "300333222100003",
    customerAddress: "The Line, NEOM", currency: "SAR",
    items: makeItems([["Strategy retainer", 1, 45000, 0]]),
    status: "draft", template: "modern",
  },
  {
    id: "inv_1006", number: "INV-2025-1006", date: "2025-11-15", dueDate: "2025-12-15",
    customerId: "c1", customerName: "Al Rajhi Trading Co.", customerVat: "300123456700003",
    customerAddress: "King Fahd Rd, Riyadh 12345", currency: "SAR",
    items: makeItems([["Support retainer — Q4", 1, 22000, 0]]),
    status: "unpaid", template: "arabic",
  },
  {
    id: "inv_1007", number: "INV-2025-1007", date: "2025-11-20", dueDate: "2025-12-20",
    customerId: "c2", customerName: "Jeddah Logistics Ltd.", customerVat: "300987654300003",
    customerAddress: "Prince Sultan St, Jeddah 21432", currency: "SAR",
    items: makeItems([["Fleet integration module", 1, 15500, 0], ["API premium tier", 6, 1200, 0]]),
    status: "paid", template: "modern",
  },
];

const defaultState: AppState = {
  auth: { user: null },
  invoices: sampleInvoices,
  customers: sampleCustomers,
  company: {
    name: "Nawa Technologies LLC",
    logoUrl: "",
    vatNumber: "300777888900003",
    crNumber: "1010999888",
    address: "Olaya District, Riyadh 12213",
    bank: "Al Rajhi Bank — IBAN SA03 8000 0000 6080 1016 7519",
    email: "billing@nawa.tech",
    phone: "+966 11 990 0110",
    website: "https://nawa.tech",
    footer: "Thank you for your business. All amounts include 15% VAT where applicable.",
    currency: "SAR",
    vatRate: 15,
  },
  settings: { language: "en", theme: "light", emailNotifs: true, smsNotifs: false, twoFactor: false },
};

let state: AppState = defaultState;
const listeners = new Set<() => void>();

function load() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...defaultState, ...JSON.parse(raw) };
  } catch {}
}

function persist() {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let loaded = false;
function ensureLoaded() {
  if (!loaded && typeof window !== "undefined") {
    load();
    loaded = true;
  }
}

export function setState(updater: (s: AppState) => AppState) {
  ensureLoaded();
  state = updater(state);
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  ensureLoaded();
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot() {
  ensureLoaded();
  return state;
}
function getServerSnapshot() {
  return defaultState;
}

export function useStore<T>(selector: (s: AppState) => T): T {
  const s = useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getServerSnapshot()));
  return s;
}

// Auth helpers
export function login(email: string, name = "Finance Manager") {
  setState((s) => ({ ...s, auth: { user: { email, name, verified: true } } }));
}
export function logout() {
  setState((s) => ({ ...s, auth: { user: null } }));
}

// Invoice helpers
export function computeTotals(items: InvoiceItem[]) {
  let subtotal = 0, vat = 0;
  for (const it of items) {
    const line = it.quantity * it.unitPrice - it.discount;
    subtotal += line;
    vat += line * (it.vatRate / 100);
  }
  return { subtotal, vat, total: subtotal + vat };
}

export function upsertInvoice(inv: Invoice) {
  setState((s) => {
    const idx = s.invoices.findIndex((i) => i.id === inv.id);
    const invoices = idx >= 0 ? s.invoices.map((i, k) => (k === idx ? inv : i)) : [inv, ...s.invoices];
    return { ...s, invoices };
  });
}
export function deleteInvoice(id: string) {
  setState((s) => ({ ...s, invoices: s.invoices.filter((i) => i.id !== id) }));
}

export function upsertCustomer(c: Customer) {
  setState((s) => {
    const idx = s.customers.findIndex((x) => x.id === c.id);
    const customers = idx >= 0 ? s.customers.map((x, k) => (k === idx ? c : x)) : [c, ...s.customers];
    return { ...s, customers };
  });
}
export function deleteCustomer(id: string) {
  setState((s) => ({ ...s, customers: s.customers.filter((c) => c.id !== id) }));
}

export function updateCompany(c: Partial<Company>) {
  setState((s) => ({ ...s, company: { ...s.company, ...c } }));
}
export function updateSettings(c: Partial<Settings>) {
  setState((s) => {
    const next = { ...s, settings: { ...s.settings, ...c } };
    if (typeof window !== "undefined") {
      document.documentElement.classList.toggle("dark", next.settings.theme === "dark");
      document.documentElement.dir = next.settings.language === "ar" ? "rtl" : "ltr";
    }
    return next;
  });
}

export function formatMoney(n: number, currency = "SAR") {
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function nextInvoiceNumber(invoices: Invoice[]) {
  const nums = invoices.map((i) => parseInt(i.number.replace(/\D/g, ""), 10)).filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 20251000;
  return `INV-${new Date().getFullYear()}-${max + 1 - 20250000}`;
}
