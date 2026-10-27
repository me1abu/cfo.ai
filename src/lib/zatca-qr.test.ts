import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import {
  buildPhase1Qr,
  bytesToBase64,
  decodeTlv,
  encodeTlv,
  invoiceQrTimestamp,
  parseZatcaQr,
  ZatcaQrError,
} from "./zatca-qr";

// Official worked examples from ZATCA's "Guide to Developed FATOORA Compliant QR Code"
// (18 Nov 2021), pages 6-7 and 9-10.
const OFFICIAL_1 = {
  input: {
    sellerName: "Bobs Records",
    vatNumber: "310122393500003",
    timestamp: "2022-04-25T15:30:00Z",
    total: 1000,
    vatTotal: 150,
  },
  hex:
    "010c426f6273205265636f726473020f333130313232333933353030303033" +
    "0314323032322d30342d32355431353a33303a30305a" +
    "0407313030302e3030" +
    "05063135302e3030",
  base64:
    "AQxCb2JzIFJlY29yZHMCDzMxMDEyMjM5MzUwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoEBzEwMDAuMDAFBjE1MC4wMA==",
};

const OFFICIAL_2 = {
  input: {
    sellerName: "Bobs Basement Records",
    vatNumber: "100025906700003",
    timestamp: "2022-04-25T15:30:00Z",
    total: 2100100.99,
    vatTotal: 315015.15,
  },
  base64:
    "ARVCb2JzIEJhc2VtZW50IFJlY29yZHMCDzEwMDAyNTkwNjcwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoECjIxMDAxMDAuOTkFCTMxNTAxNS4xNQ==",
};

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

describe("ZATCA QR encoding matches the official examples", () => {
  it("example 1: hex bytes and Base64", () => {
    const { input } = OFFICIAL_1;
    const bytes = encodeTlv([
      { tag: 1, value: input.sellerName },
      { tag: 2, value: input.vatNumber },
      { tag: 3, value: input.timestamp },
      { tag: 4, value: "1000.00" },
      { tag: 5, value: "150.00" },
    ]);
    expect(toHex(bytes)).toBe(OFFICIAL_1.hex);
    expect(bytesToBase64(bytes)).toBe(OFFICIAL_1.base64);
    expect(buildPhase1Qr(input)).toBe(OFFICIAL_1.base64);
  });

  it("example 2: Base64", () => {
    expect(buildPhase1Qr(OFFICIAL_2.input)).toBe(OFFICIAL_2.base64);
  });

  it("decodes the official example back to its fields", () => {
    const parsed = parseZatcaQr(OFFICIAL_2.base64);
    expect(parsed.fields).toEqual({
      sellerName: "Bobs Basement Records",
      vatNumber: "100025906700003",
      timestamp: "2022-04-25T15:30:00Z",
      total: "2100100.99",
      vatTotal: "315015.15",
    });
    expect(parsed.missingPhase1Tags).toEqual([]);
    expect(parsed.hasPhase2Tags).toBe(false);
  });
});

describe("ZATCA QR edge cases", () => {
  it("uses UTF-8 byte length, not character count, for Arabic", () => {
    const name = "شركة نوى للتقنية";
    const bytes = encodeTlv([{ tag: 1, value: name }]);
    expect(bytes[1]).toBe(new TextEncoder().encode(name).length);
    expect(bytes[1]).toBeGreaterThan(name.length);
    expect(decodeTlv(bytes)).toEqual([{ tag: 1, value: name }]);
  });

  it("rejects values over 255 bytes", () => {
    expect(() => encodeTlv([{ tag: 1, value: "x".repeat(256) }])).toThrow(ZatcaQrError);
  });

  it("requires seller name and VAT number", () => {
    expect(() => buildPhase1Qr({ ...OFFICIAL_1.input, sellerName: " " })).toThrow(/Seller name/);
    expect(() => buildPhase1Qr({ ...OFFICIAL_1.input, vatNumber: "" })).toThrow(/VAT number/);
  });

  it("rejects content that is not ZATCA TLV", () => {
    expect(() => parseZatcaQr("https://example.com/invoice/1")).toThrow(ZatcaQrError);
    expect(() => parseZatcaQr(btoa("hello"))).toThrow(ZatcaQrError);
  });

  it("rejects truncated TLV", () => {
    expect(() => decodeTlv(Uint8Array.from([1, 10, 65, 66]))).toThrow(/ends early/);
  });
});

describe("invoice timestamp", () => {
  it("Asia/Riyadh is UTC+3 in both January and July (no DST)", () => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Riyadh",
      timeZoneName: "longOffset",
    });
    const offset = (d: Date) => fmt.formatToParts(d).find((p) => p.type === "timeZoneName")?.value;
    expect(offset(new Date("2026-01-15T12:00:00Z"))).toBe("GMT+03:00");
    expect(offset(new Date("2026-07-15T12:00:00Z"))).toBe("GMT+03:00");
  });

  it("combines the issue date with the Riyadh time of issue, in UTC", () => {
    // Issued at 18:30:05 Riyadh time (15:30:05Z), issue date 2026-10-27.
    expect(invoiceQrTimestamp("2026-10-27", "2026-10-27T15:30:05.123Z")).toBe(
      "2026-10-27T15:30:05Z",
    );
    // Early morning in Riyadh is the previous day in UTC.
    expect(invoiceQrTimestamp("2026-10-27", "2026-10-26T22:15:00Z")).toBe("2026-10-26T22:15:00Z");
  });
});

describe("generated QR image is scannable", () => {
  it("decodes back to the exact payload", async () => {
    const payload = buildPhase1Qr({
      sellerName: "نوى للتقنية Nawa Technologies LLC",
      vatNumber: "300777888900003",
      timestamp: "2026-10-27T09:00:00Z",
      total: 20700,
      vatTotal: 2700,
    });
    const png = PNG.sync.read(
      await QRCode.toBuffer(payload, { errorCorrectionLevel: "M", margin: 4, width: 400 }),
    );
    const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(result?.data).toBe(payload);
    expect(parseZatcaQr(result!.data).fields.sellerName).toBe("نوى للتقنية Nawa Technologies LLC");
  });
});
