import { generateKeyPairSync, sign as ecdsaSign } from "node:crypto";

// A small DER writer: a CSR needs only these few types, and ZATCA's secp256k1 curve is not
// available through WebCrypto, which common CSR libraries depend on.
function tlv(tag: number, content: Buffer) {
  const n = content.length;
  let length: Buffer;
  if (n < 0x80) length = Buffer.from([n]);
  else if (n < 0x100) length = Buffer.from([0x81, n]);
  else length = Buffer.from([0x82, n >> 8, n & 0xff]);
  return Buffer.concat([Buffer.from([tag]), length, content]);
}
const seq = (...items: Buffer[]) => tlv(0x30, Buffer.concat(items));
const set = (...items: Buffer[]) => tlv(0x31, Buffer.concat(items));
const utf8 = (s: string) => tlv(0x0c, Buffer.from(s, "utf8"));
const printable = (s: string) => tlv(0x13, Buffer.from(s, "ascii"));

function oid(dotted: string) {
  const [a, b, ...rest] = dotted.split(".").map(Number);
  const bytes = [a * 40 + b];
  for (const n of rest) {
    const chunk = [n & 0x7f];
    for (let v = n >>> 7; v > 0; v >>>= 7) chunk.unshift((v & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
}

const rdn = (type: string, value: Buffer) => set(seq(oid(type), value));

const OID = {
  country: "2.5.4.6",
  organizationalUnit: "2.5.4.11",
  organization: "2.5.4.10",
  commonName: "2.5.4.3",
  surname: "2.5.4.4", // OpenSSL's "SN": holds the EGS serial
  userId: "0.9.2342.19200300.100.1.1",
  title: "2.5.4.12",
  registeredAddress: "2.5.4.26",
  businessCategory: "2.5.4.15",
  extensionRequest: "1.2.840.113549.1.9.14",
  certificateTemplate: "1.3.6.1.4.1.311.20.2",
  subjectAltName: "2.5.29.17",
  ecdsaWithSha256: "1.2.840.10045.4.3.2",
};

export type ZatcaEnvironment = "developer-portal" | "simulation" | "core";

const TEMPLATE_NAME: Record<ZatcaEnvironment, string> = {
  "developer-portal": "TSTZATCA-Code-Signing",
  simulation: "PREZATCA-Code-Signing",
  core: "ZATCA-Code-Signing",
};

export interface CsrInput {
  environment: ZatcaEnvironment;
  /** Taxpayer name. */
  organization: string;
  /** Branch name, or the 10-digit TIN for a VAT group member. */
  organizationalUnit: string;
  /** Unique name for this EGS unit. */
  commonName: string;
  vatNumber: string;
  /** e.g. 1-AIInvoice|2-1.0|3-<uuid> */
  serial: string;
  /** Standard, simplified, then two reserved digits: 1100 is both. */
  invoiceTypes: string;
  location: string;
  industry: string;
}

export function generateCsr(input: CsrInput) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "secp256k1" });

  const subject = seq(
    rdn(OID.country, printable("SA")),
    rdn(OID.organizationalUnit, utf8(input.organizationalUnit)),
    rdn(OID.organization, utf8(input.organization)),
    rdn(OID.commonName, utf8(input.commonName)),
  );

  const directoryName = seq(
    rdn(OID.surname, utf8(input.serial)),
    rdn(OID.userId, utf8(input.vatNumber)),
    rdn(OID.title, utf8(input.invoiceTypes)),
    rdn(OID.registeredAddress, utf8(input.location)),
    rdn(OID.businessCategory, utf8(input.industry)),
  );
  // GeneralNames holding one directoryName, context tag [4].
  const subjectAltName = seq(tlv(0xa4, directoryName));

  const extensions = seq(
    seq(oid(OID.certificateTemplate), tlv(0x04, utf8(TEMPLATE_NAME[input.environment]))),
    seq(oid(OID.subjectAltName), tlv(0x04, subjectAltName)),
  );

  const info = seq(
    tlv(0x02, Buffer.from([0])),
    subject,
    publicKey.export({ type: "spki", format: "der" }),
    tlv(0xa0, seq(oid(OID.extensionRequest), set(extensions))),
  );

  const signature = ecdsaSign("sha256", info, privateKey);
  const csr = seq(
    info,
    seq(oid(OID.ecdsaWithSha256)),
    tlv(0x03, Buffer.concat([Buffer.from([0]), signature])),
  );

  const body = csr
    .toString("base64")
    .replace(/(.{64})/g, "$1\n")
    .trimEnd();
  return {
    csrPem: `-----BEGIN CERTIFICATE REQUEST-----\n${body}\n-----END CERTIFICATE REQUEST-----\n`,
    privateKeyPem: privateKey.export({ type: "sec1", format: "pem" }).toString(),
  };
}
