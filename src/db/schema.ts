import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  date,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const invoiceStatus = pgEnum("invoice_status", ["draft", "unpaid", "paid", "overdue"]);
export const invoiceTemplate = pgEnum("invoice_template", [
  "modern",
  "corporate",
  "minimal",
  "arabic",
  "bilingual",
]);

const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });

/** One organisation (seller) per workspace. Company profile fields live here. */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  logoUrl: text("logo_url").notNull().default(""),
  vatNumber: text("vat_number").notNull().default(""),
  crNumber: text("cr_number").notNull().default(""),
  address: text("address").notNull().default(""),
  bank: text("bank").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  website: text("website").notNull().default(""),
  footer: text("footer").notNull().default(""),
  currency: text("currency").notNull().default("SAR"),
  vatRate: numeric("vat_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(15),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** Mirrors auth.users (same id). Holds per-user preferences and org membership. */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // = auth.users.id
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  fullName: text("full_name").notNull().default(""),
  language: text("language").notNull().default("en"),
  theme: text("theme").notNull().default("light"),
  emailNotifs: boolean("email_notifs").notNull().default(true),
  smsNotifs: boolean("sms_notifs").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    vatNumber: text("vat_number").notNull().default(""),
    crNumber: text("cr_number").notNull().default(""),
    address: text("address").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customers_org_idx").on(t.orgId)],
).enableRLS();

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    // Snapshot of customer details at issue time (invoices must not change if the customer is edited).
    customerName: text("customer_name").notNull(),
    customerVat: text("customer_vat").notNull().default(""),
    customerAddress: text("customer_address").notNull().default(""),
    currency: text("currency").notNull().default("SAR"),
    status: invoiceStatus("status").notNull().default("draft"),
    template: invoiceTemplate("template").notNull().default("modern"),
    notes: text("notes").notNull().default(""),
    // Set once, when the invoice first leaves draft. Supplies the time component of the
    // invoice timestamp required in the ZATCA QR code (tag 3). Null while draft.
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_org_number_uq").on(t.orgId, t.number),
    index("invoices_org_idx").on(t.orgId),
  ],
).enableRLS();

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull().default(""),
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull().default(1),
    unitPrice: money("unit_price").notNull().default(0),
    discount: money("discount").notNull().default(0),
    vatRate: numeric("vat_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(15),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId)],
).enableRLS();

export type Organization = typeof organizations.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type CustomerRow = typeof customers.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceItemRow = typeof invoiceItems.$inferSelect;
