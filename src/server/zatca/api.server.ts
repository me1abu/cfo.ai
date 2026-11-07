import type { ZatcaEnvironment } from "./csr.server";

const BASE = "https://gw-fatoora.zatca.gov.sa/e-invoicing";

export interface Credentials {
  /** binarySecurityToken exactly as ZATCA returned it. */
  token: string;
  secret: string;
}

export interface ValidationMessage {
  code: string;
  message: string;
  status?: string;
}

export interface SubmissionResult {
  /** HTTP status: 200 accepted, 202 accepted with warnings, 400 rejected. */
  httpStatus: number;
  accepted: boolean;
  warnings: ValidationMessage[];
  errors: ValidationMessage[];
  /** Standard invoices: the invoice with ZATCA's stamp and QR, as Base64. */
  clearedInvoice?: string;
  raw: unknown;
}

/** A request that never reached a decision: network failure or a ZATCA outage. Safe to retry. */
export class ZatcaUnavailableError extends Error {}

/** ZATCA refused an onboarding request, e.g. a wrong or expired OTP. */
export class ZatcaRequestError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

const basicAuth = (c: Credentials) =>
  `Basic ${Buffer.from(`${c.token}:${c.secret}`).toString("base64")}`;

async function call(
  env: ZatcaEnvironment,
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string>,
) {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${env}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "Accept-Version": "V2",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new ZatcaUnavailableError(`ZATCA could not be reached: ${String(err)}`);
  }
  if (res.status >= 500 || res.status === 429) {
    throw new ZatcaUnavailableError(`ZATCA returned ${res.status}`);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: text };
  }
  return { status: res.status, json: json as Record<string, unknown> | null };
}

function credentialsFrom(res: Awaited<ReturnType<typeof call>>, step: string) {
  const j = res.json;
  if (res.status !== 200 || !j?.binarySecurityToken) {
    const detail = (j?.errors ?? j?.message ?? j?.dispositionMessage ?? "") as unknown;
    throw new ZatcaRequestError(
      `${step} failed (${res.status}): ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
      res.status,
    );
  }
  return {
    token: String(j.binarySecurityToken),
    secret: String(j.secret),
    requestId: String(j.requestID),
  };
}

/** The certificate inside a binarySecurityToken, which is Base64 of Base64 DER. */
export const certificateFromToken = (token: string) =>
  Buffer.from(token, "base64").toString("utf8");

export async function requestComplianceCsid(env: ZatcaEnvironment, csrPem: string, otp: string) {
  const res = await call(
    env,
    "POST",
    "/compliance",
    { csr: Buffer.from(csrPem).toString("base64") },
    { OTP: otp },
  );
  return credentialsFrom(res, "Compliance certificate request");
}

export async function requestProductionCsid(
  env: ZatcaEnvironment,
  compliance: Credentials,
  requestId: string,
) {
  const res = await call(
    env,
    "POST",
    "/production/csids",
    { compliance_request_id: requestId },
    { Authorization: basicAuth(compliance) },
  );
  return credentialsFrom(res, "Production certificate request");
}

function toResult(res: Awaited<ReturnType<typeof call>>): SubmissionResult {
  const j = res.json ?? {};
  const v = (j.validationResults ?? {}) as {
    warningMessages?: ValidationMessage[];
    errorMessages?: ValidationMessage[];
  };
  const status = String(j.reportingStatus ?? j.clearanceStatus ?? "");
  return {
    httpStatus: res.status,
    accepted:
      (res.status === 200 || res.status === 202) &&
      !["NOT_REPORTED", "NOT_CLEARED"].includes(status),
    warnings: v.warningMessages ?? [],
    errors: v.errorMessages ?? [],
    clearedInvoice: typeof j.clearedInvoice === "string" ? j.clearedInvoice : undefined,
    raw: j,
  };
}

interface Submission {
  xml: string;
  hash: string;
  uuid: string;
}

const payload = (s: Submission) => ({
  invoiceHash: s.hash,
  uuid: s.uuid,
  invoice: Buffer.from(s.xml, "utf8").toString("base64"),
});

export async function checkCompliance(env: ZatcaEnvironment, c: Credentials, s: Submission) {
  return toResult(
    await call(env, "POST", "/compliance/invoices", payload(s), { Authorization: basicAuth(c) }),
  );
}

export async function reportInvoice(env: ZatcaEnvironment, c: Credentials, s: Submission) {
  return toResult(
    await call(env, "POST", "/invoices/reporting/single", payload(s), {
      Authorization: basicAuth(c),
      "Clearance-Status": "0",
    }),
  );
}

export async function clearInvoice(env: ZatcaEnvironment, c: Credentials, s: Submission) {
  return toResult(
    await call(env, "POST", "/invoices/clearance/single", payload(s), {
      Authorization: basicAuth(c),
      "Clearance-Status": "1",
    }),
  );
}
