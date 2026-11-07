import { X509Certificate, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { serverEnv } from "@/lib/env.server";
import type { Company, ZatcaMessage, ZatcaStatus } from "@/lib/invoice-math";
import {
  companyBlockers,
  qrFromClearedXml,
  sellerParty,
  toZatcaDocument,
} from "@/lib/zatca-phase2";
import { invoiceKind } from "@/lib/zatca-rules";
import { FIRST_PREVIOUS_HASH, type ZatcaDocument } from "@/lib/zatca-xml";
import { type Exec, loadCompany, loadInvoice } from "../data.server";
import {
  type SubmissionResult,
  ZatcaUnavailableError,
  certificateFromToken,
  checkCompliance,
  clearInvoice,
  reportInvoice,
  requestComplianceCsid,
  requestProductionCsid,
} from "./api.server";
import { generateCsr } from "./csr.server";
import { signInvoice } from "./sign.server";
import { decryptSecret, encryptSecret } from "./vault.server";

export class ZatcaOnboardingError extends Error {}

const signingTime = () => new Date().toISOString().slice(0, 19);

const messages = (list: { code: string; message: string }[]): ZatcaMessage[] =>
  list.map(({ code, message }) => ({ code, message }));

/** The six documents ZATCA requires before it issues a production certificate. */
function complianceSamples(
  company: Company,
): Omit<ZatcaDocument, "uuid" | "icv" | "previousHash">[] {
  const seller = sellerParty(company);
  // A sample standard document needs a buyer; ZATCA only checks its form here.
  const buyer = { ...seller, name: "Compliance Check Buyer", vatNumber: "399999999800003" };
  const today = new Date().toISOString().slice(0, 10);
  const base = {
    issueDate: today,
    issueTime: "00:00:01",
    seller,
    lines: [
      { description: "Compliance check", quantity: 1, unitPrice: 100, discount: 0, vatRate: 15 },
    ],
  };
  const note = { billingReference: "CHECK-1", reason: "Compliance check" };
  return [
    { ...base, number: "CHECK-1", kind: "standard", type: "invoice", buyer },
    { ...base, number: "CHECK-2", kind: "simplified", type: "invoice", buyer: null },
    { ...base, ...note, number: "CHECK-3", kind: "standard", type: "credit_note", buyer },
    { ...base, ...note, number: "CHECK-4", kind: "simplified", type: "credit_note", buyer: null },
    { ...base, ...note, number: "CHECK-5", kind: "standard", type: "debit_note", buyer },
    { ...base, ...note, number: "CHECK-6", kind: "simplified", type: "debit_note", buyer: null },
  ];
}

export async function getUnit(orgId: string) {
  return db.query.zatcaUnits.findFirst({ where: eq(schema.zatcaUnits.orgId, orgId) });
}

/** Connects an organisation to ZATCA: CSR, compliance checks, production certificate. */
export async function onboard(
  orgId: string,
  input: { otp: string; branch: string; industry: string },
) {
  const company = await loadCompany(orgId);
  const blockers = companyBlockers(company);
  if (blockers.length) {
    throw new ZatcaOnboardingError(`Before connecting, add ${blockers.join("; ")}.`);
  }
  const env = serverEnv.ZATCA_ENVIRONMENT;
  const unitId = randomUUID();
  const serial = `1-AIInvoice|2-1.0|3-${unitId}`;
  const commonName = `AIInvoice-${unitId.slice(0, 8)}`;
  const address = company.nationalAddress!;

  const { csrPem, privateKeyPem } = generateCsr({
    environment: env,
    organization: company.name,
    organizationalUnit: input.branch,
    commonName,
    vatNumber: company.vatNumber,
    serial,
    invoiceTypes: "1100",
    location: `${address.building} ${address.street}, ${address.city}`,
    industry: input.industry,
  });

  const compliance = await requestComplianceCsid(env, csrPem, input.otp);
  const certificate = certificateFromToken(compliance.token);

  let previousHash = FIRST_PREVIOUS_HASH;
  for (const [i, sample] of complianceSamples(company).entries()) {
    const doc: ZatcaDocument = { ...sample, uuid: randomUUID(), icv: i + 1, previousHash };
    const signed = signInvoice(doc, privateKeyPem, certificate, signingTime());
    previousHash = signed.hash;
    const result = await checkCompliance(env, compliance, {
      xml: signed.xml,
      hash: signed.hash,
      uuid: doc.uuid,
    });
    if (!result.accepted) {
      const detail = result.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
      throw new ZatcaOnboardingError(`ZATCA's compliance check failed on ${doc.number}. ${detail}`);
    }
  }

  const production = await requestProductionCsid(env, compliance, compliance.requestId);
  const productionCert = new X509Certificate(
    Buffer.from(certificateFromToken(production.token), "base64"),
  );

  await db.insert(schema.zatcaUnits).values({
    orgId,
    environment: env,
    commonName,
    serial,
    privateKey: encryptSecret(privateKeyPem),
    token: production.token,
    secret: encryptSecret(production.secret),
    certificateExpiresAt: new Date(productionCert.validTo),
    lastHash: FIRST_PREVIOUS_HASH,
  });
}

/** Signs the document once and takes its place in the chain. A retry reuses the same signature. */
async function signForSubmission(orgId: string, invoiceId: string) {
  return db.transaction(async (tx) => {
    // Serialises signing per organisation: counters and previous hashes must never fork.
    const [unit] = await tx
      .select()
      .from(schema.zatcaUnits)
      .where(eq(schema.zatcaUnits.orgId, orgId))
      .for("update");
    if (!unit) return null;

    const z = schema.zatcaDocuments;
    const [existing] = await tx.select().from(z).where(eq(z.invoiceId, invoiceId));
    if (existing && existing.status !== "rejected") return { unit, doc: existing };

    const inv = await loadInvoice(orgId, invoiceId, tx);
    if (!inv?.issuedAt) throw new Error("Only issued documents go to ZATCA");
    const company = await loadCompany(orgId);
    const original = inv.originalInvoiceId
      ? await loadInvoice(orgId, inv.originalInvoiceId, tx)
      : null;

    const uuid = randomUUID();
    const counter = unit.lastCounter + 1;
    const doc = toZatcaDocument(
      inv,
      company,
      { uuid, icv: counter, previousHash: unit.lastHash },
      original?.number ?? null,
    );
    const signed = signInvoice(
      doc,
      decryptSecret(unit.privateKey),
      certificateFromToken(unit.token),
      signingTime(),
    );

    await tx
      .update(schema.zatcaUnits)
      .set({ lastCounter: counter, lastHash: signed.hash })
      .where(eq(schema.zatcaUnits.orgId, orgId));

    const row = {
      invoiceId,
      orgId,
      uuid,
      counter,
      hash: signed.hash,
      qr: signed.qr,
      status: "pending" as ZatcaStatus,
      signedXml: signed.xml,
      clearedXml: null,
      warnings: [],
      errors: [],
      updatedAt: new Date(),
    };
    const [saved] = await tx
      .insert(z)
      .values(row)
      .onConflictDoUpdate({ target: z.invoiceId, set: row })
      .returning();
    return { unit, doc: saved };
  });
}

async function returnToDraft(orgId: string, invoiceId: string, exec: Exec = db) {
  await exec
    .update(schema.invoices)
    .set({ status: "draft", issuedAt: null, updatedAt: new Date() })
    .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.orgId, orgId)));
}

export type ZatcaOutcome =
  { status: "none" } | { status: ZatcaStatus; warnings: ZatcaMessage[]; errors: ZatcaMessage[] };

/**
 * Sends an issued document to ZATCA: clearance for standard, reporting for simplified.
 * A rejected document returns to draft so it can be corrected; a network failure leaves it
 * pending for a retry, with the same signature and place in the chain.
 */
export async function submitToZatca(orgId: string, invoiceId: string): Promise<ZatcaOutcome> {
  let prepared: Awaited<ReturnType<typeof signForSubmission>>;
  try {
    prepared = await signForSubmission(orgId, invoiceId);
  } catch (err) {
    // Unsigned means ZATCA will never see it, so it must not stay issued.
    console.error("Signing a ZATCA document failed", invoiceId, err);
    await returnToDraft(orgId, invoiceId);
    const message = "The document couldn't be signed, so it wasn't issued. Please try again.";
    return { status: "rejected", warnings: [], errors: [{ code: "signing", message }] };
  }
  if (!prepared) return { status: "none" };
  const { unit, doc } = prepared;
  if (doc.status !== "pending") {
    return { status: doc.status, warnings: doc.warnings, errors: doc.errors };
  }

  const inv = await loadInvoice(orgId, invoiceId);
  if (!inv) throw new Error("Invoice not found");
  const credentials = { token: unit.token, secret: decryptSecret(unit.secret) };
  const submission = { xml: doc.signedXml, hash: doc.hash, uuid: doc.uuid };
  const standard = invoiceKind(inv) === "standard";

  let result: SubmissionResult;
  try {
    result = await (standard ? clearInvoice : reportInvoice)(
      unit.environment,
      credentials,
      submission,
    );
  } catch (err) {
    if (err instanceof ZatcaUnavailableError) {
      console.error("ZATCA unavailable", err.message);
      return { status: "pending", warnings: [], errors: [] };
    }
    throw err;
  }

  const warnings = messages(result.warnings);
  const errors = messages(result.errors);
  const z = schema.zatcaDocuments;

  if (!result.accepted) {
    console.error("ZATCA rejected a document", invoiceId, JSON.stringify(result.raw));
    await db.transaction(async (tx) => {
      await tx
        .update(z)
        .set({ status: "rejected", warnings, errors, updatedAt: new Date() })
        .where(eq(z.invoiceId, invoiceId));
      await returnToDraft(orgId, invoiceId, tx);
    });
    return { status: "rejected", warnings, errors };
  }

  const clearedXml = result.clearedInvoice
    ? Buffer.from(result.clearedInvoice, "base64").toString("utf8")
    : null;
  const status: ZatcaStatus = standard ? "cleared" : "reported";
  await db
    .update(z)
    .set({
      status,
      clearedXml,
      qr: (clearedXml && qrFromClearedXml(clearedXml)) || doc.qr,
      warnings,
      errors,
      updatedAt: new Date(),
    })
    .where(eq(z.invoiceId, invoiceId));
  return { status, warnings, errors };
}
