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
  check,
  primaryKey,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { NationalAddress, ZatcaMessage, ZatcaStatus } from "@/lib/invoice-math";

export const invoiceStatus = pgEnum("invoice_status", ["draft", "unpaid", "paid", "overdue"]);
// "credit_note" reduces a previously issued tax invoice (ZATCA Tax Invoicing Guideline s.7).
export const documentType = pgEnum("document_type", ["invoice", "credit_note"]);
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
  nationalAddress: jsonb("national_address").$type<NationalAddress>(),
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
    nationalAddress: jsonb("national_address").$type<NationalAddress>(),
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
    documentType: documentType("document_type").notNull().default("invoice"),
    // Credit notes must reference the invoice they amend (XML BR-KSA-56) and state a reason
    // (BR-KSA-17). Issued invoices can't be deleted, so the reference stays valid.
    originalInvoiceId: uuid("original_invoice_id").references((): AnyPgColumn => invoices.id, {
      onDelete: "restrict",
    }),
    reason: text("reason").notNull().default(""),
    number: text("number").notNull(),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    // Snapshot of customer details at issue time (invoices must not change if the customer is edited).
    customerName: text("customer_name").notNull(),
    customerVat: text("customer_vat").notNull().default(""),
    customerAddress: text("customer_address").notNull().default(""),
    customerNationalAddress: jsonb("customer_national_address").$type<NationalAddress>(),
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
    index("invoices_original_idx").on(t.originalInvoiceId),
    check(
      "credit_note_has_original",
      sql`${t.documentType} <> 'credit_note' OR ${t.originalInvoiceId} IS NOT NULL`,
    ),
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

/** Metered calls per organisation per Saudi calendar day, for the caps in ai/usage.server.ts. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    kind: text("kind", { enum: ["document", "assistant", "email"] }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.day, t.kind] })],
).enableRLS();

/**
 * An organisation's connection to ZATCA (its EGS unit). Written once, after onboarding succeeds.
 * The private key and secret are encrypted with ZATCA_KEY_SECRET (zatca/vault.server.ts).
 */
export const zatcaUnits = pgTable("zatca_units", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  environment: text("environment", { enum: ["developer-portal", "simulation", "core"] }).notNull(),
  commonName: text("common_name").notNull(),
  serial: text("serial").notNull(),
  privateKey: text("private_key").notNull(),
  /** The production CSID's binarySecurityToken. */
  token: text("token").notNull(),
  secret: text("secret").notNull(),
  certificateExpiresAt: timestamp("certificate_expires_at", { withTimezone: true }).notNull(),
  // The invoice chain: each document carries the next counter and the previous document's hash.
  lastCounter: integer("last_counter").notNull().default(0),
  lastHash: text("last_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** The signed document and ZATCA's answer, kept separate so invoice lists don't load the XML. */
export const zatcaDocuments = pgTable(
  "zatca_documents",
  {
    invoiceId: uuid("invoice_id")
      .primaryKey()
      .references(() => invoices.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    uuid: uuid("uuid").notNull(),
    counter: integer("counter").notNull(),
    hash: text("hash").notNull(),
    qr: text("qr").notNull(),
    status: text("status").$type<ZatcaStatus>().notNull(),
    signedXml: text("signed_xml").notNull(),
    /** Standard documents: the version ZATCA stamped, which is the legal invoice. */
    clearedXml: text("cleared_xml"),
    warnings: jsonb("warnings").$type<ZatcaMessage[]>().notNull().default([]),
    errors: jsonb("errors").$type<ZatcaMessage[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("zatca_documents_org_idx").on(t.orgId)],
).enableRLS();

export type Organization = typeof organizations.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type CustomerRow = typeof customers.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceItemRow = typeof invoiceItems.$inferSelect;
