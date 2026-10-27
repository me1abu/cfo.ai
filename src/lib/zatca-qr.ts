/**
 * ZATCA e-invoice QR code (Phase 1 / generation phase).
 *
 * Source: ZATCA, "Guide to Developed FATOORA Compliant QR Code" (18 Nov 2021) and the
 * Electronic Invoice Security Features Implementation Standards.
 *  - Fields are encoded as TLV: Tag = 1 byte, Length = 1 byte holding the length of the
 *    UTF-8 byte array of the value, Value = the UTF-8 bytes. No padding or separators.
 *  - The concatenated byte array is Base64-encoded; that string is the QR content.
 *  - Phase 1 tags: 1 seller name, 2 seller VAT number, 3 invoice timestamp (ISO 8601),
 *    4 invoice total with VAT, 5 VAT total. Tags 6-9 (hash, signature, public key,
 *    CA signature) belong to Phase 2 integration and are not produced here.
 *  - The guide caps the Base64 QR content at 500 characters.
 */

export const QR_TAGS = {
  sellerName: 1,
  vatNumber: 2,
  timestamp: 3,
  total: 4,
  vatTotal: 5,
} as const;

export const QR_TAG_LABELS: Record<number, string> = {
  1: "Seller name",
  2: "Seller VAT number",
  3: "Invoice timestamp",
  4: "Invoice total (with VAT)",
  5: "VAT total",
  6: "Hash of XML invoice",
  7: "ECDSA signature",
  8: "ECDSA public key",
  9: "Signature of the stamp's public key by ZATCA's CA",
};

/** Maximum Base64 length stated in ZATCA's QR guide. */
export const QR_MAX_BASE64_LENGTH = 500;
/** A one-byte length field caps each value at 255 UTF-8 bytes. */
export const TLV_MAX_VALUE_BYTES = 255;

export class ZatcaQrError extends Error {}

export interface TlvField {
  tag: number;
  value: string;
}

export interface Phase1QrInput {
  sellerName: string;
  vatNumber: string;
  /** ISO 8601, e.g. "2022-04-25T15:30:00Z". Use invoiceQrTimestamp() to build it. */
  timestamp: string;
  total: number | string;
  vatTotal: number | string;
}

export interface Phase1QrFields {
  sellerName?: string;
  vatNumber?: string;
  timestamp?: string;
  total?: string;
  vatTotal?: string;
}

const utf8 = new TextEncoder();
const utf8Strict = new TextDecoder("utf-8", { fatal: true });

export function encodeTlv(fields: TlvField[]): Uint8Array {
  const parts: number[] = [];
  for (const { tag, value } of fields) {
    if (!Number.isInteger(tag) || tag < 1 || tag > 255) {
      throw new ZatcaQrError(`Invalid TLV tag ${tag}`);
    }
    const bytes = utf8.encode(value);
    if (bytes.length > TLV_MAX_VALUE_BYTES) {
      throw new ZatcaQrError(
        `${QR_TAG_LABELS[tag] ?? `Tag ${tag}`} is ${bytes.length} bytes; the QR format allows at most ${TLV_MAX_VALUE_BYTES}.`,
      );
    }
    parts.push(tag, bytes.length, ...bytes);
  }
  return Uint8Array.from(parts);
}

export function decodeTlv(bytes: Uint8Array): TlvField[] {
  const fields: TlvField[] = [];
  let i = 0;
  while (i < bytes.length) {
    if (i + 2 > bytes.length) throw new ZatcaQrError("Truncated TLV header");
    const tag = bytes[i];
    const length = bytes[i + 1];
    const start = i + 2;
    const end = start + length;
    if (tag === 0) throw new ZatcaQrError("Invalid TLV tag 0");
    if (end > bytes.length)
      throw new ZatcaQrError(`Tag ${tag} declares ${length} bytes but the data ends early`);
    let value: string;
    try {
      value = utf8Strict.decode(bytes.subarray(start, end));
    } catch {
      throw new ZatcaQrError(`Tag ${tag} is not valid UTF-8`);
    }
    fields.push({ tag, value });
    i = end;
  }
  return fields;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 !== 0) {
    throw new ZatcaQrError("Not a Base64 string");
  }
  const binary = atob(clean);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Amounts are written with two decimals, as in ZATCA's examples ("1000.00", "150.00"). */
export function formatQrAmount(n: number | string): string {
  const value = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(value)) throw new ZatcaQrError(`Invalid amount: ${n}`);
  return value.toFixed(2);
}

/** ISO 8601 in UTC without milliseconds, matching ZATCA's example "2022-04-25T15:30:00Z". */
export function formatQrTimestamp(d: Date): string {
  if (Number.isNaN(d.getTime())) throw new ZatcaQrError("Invalid timestamp");
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Saudi Arabia does not observe daylight saving time; the unit tests assert this offset
// against the platform's time zone database for both January and July.
const RIYADH_OFFSET = "+03:00";

const riyadhTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Riyadh",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Invoice timestamp for QR tag 3: the invoice's issue date combined with the time of day
 * (Riyadh) at which it was issued, expressed in UTC.
 * `issuedAt` is null for drafts; `now` is then used to produce a preview.
 */
export function invoiceQrTimestamp(issueDate: string, issuedAt: string | null, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) throw new ZatcaQrError("Invalid issue date");
  const ref = issuedAt ? new Date(issuedAt) : now;
  const hms = riyadhTime.format(ref);
  return formatQrTimestamp(new Date(`${issueDate}T${hms}${RIYADH_OFFSET}`));
}

export function buildPhase1Qr(input: Phase1QrInput): string {
  const sellerName = input.sellerName.trim();
  const vatNumber = input.vatNumber.trim();
  if (!sellerName) throw new ZatcaQrError("Seller name is required for the QR code");
  if (!vatNumber) throw new ZatcaQrError("Seller VAT number is required for the QR code");
  const b64 = bytesToBase64(
    encodeTlv([
      { tag: QR_TAGS.sellerName, value: sellerName },
      { tag: QR_TAGS.vatNumber, value: vatNumber },
      { tag: QR_TAGS.timestamp, value: input.timestamp },
      { tag: QR_TAGS.total, value: formatQrAmount(input.total) },
      { tag: QR_TAGS.vatTotal, value: formatQrAmount(input.vatTotal) },
    ]),
  );
  if (b64.length > QR_MAX_BASE64_LENGTH) {
    throw new ZatcaQrError(
      `QR content is ${b64.length} characters; ZATCA allows at most ${QR_MAX_BASE64_LENGTH}. Shorten the company name.`,
    );
  }
  return b64;
}

export interface ParsedQr {
  fields: Phase1QrFields;
  tags: TlvField[];
  missingPhase1Tags: number[];
  hasPhase2Tags: boolean;
}

/** Parses a scanned QR string. Throws ZatcaQrError if it is not Base64 TLV. */
export function parseZatcaQr(content: string): ParsedQr {
  const tags = decodeTlv(base64ToBytes(content));
  if (tags.length === 0) throw new ZatcaQrError("QR content is empty");
  const byTag = new Map(tags.map((t) => [t.tag, t.value]));
  const fields: Phase1QrFields = {
    sellerName: byTag.get(1),
    vatNumber: byTag.get(2),
    timestamp: byTag.get(3),
    total: byTag.get(4),
    vatTotal: byTag.get(5),
  };
  const missingPhase1Tags = [1, 2, 3, 4, 5].filter((t) => !byTag.has(t));
  if (missingPhase1Tags.length === 5) {
    throw new ZatcaQrError("This QR code does not contain ZATCA invoice fields");
  }
  return {
    fields,
    tags,
    missingPhase1Tags,
    hasPhase2Tags: tags.some((t) => t.tag >= 6 && t.tag <= 9),
  };
}
