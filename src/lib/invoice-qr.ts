import { useMemo } from "react";
import QRCode from "qrcode";
import { computeTotals, type Company, type Invoice } from "@/lib/invoice-math";
import { buildPhase1Qr, invoiceQrTimestamp, ZatcaQrError } from "@/lib/zatca-qr";

// Error correction "M" recovers ~15% damage, a common choice for printed codes.
export const QR_IMAGE_OPTIONS = { errorCorrectionLevel: "M" as const, margin: 2 };

export type InvoiceQr =
  | { ok: true; payload: string; timestamp: string; isPreview: boolean }
  | { ok: false; error: string };

/** Builds the ZATCA Phase 1 QR payload for an invoice, or explains why it can't. */
export function useInvoiceQr(inv: Invoice, company: Company): InvoiceQr {
  return useMemo(() => {
    try {
      const totals = computeTotals(inv.items);
      const timestamp = invoiceQrTimestamp(inv.date, inv.issuedAt);
      const payload = buildPhase1Qr({
        sellerName: company.name,
        vatNumber: company.vatNumber,
        timestamp,
        total: totals.total,
        vatTotal: totals.vat,
      });
      return { ok: true, payload, timestamp, isPreview: inv.issuedAt === null };
    } catch (err) {
      if (err instanceof ZatcaQrError) return { ok: false, error: err.message };
      throw err;
    }
  }, [inv.items, inv.date, inv.issuedAt, company.name, company.vatNumber]);
}

export async function downloadQrPng(payload: string, filename: string) {
  const url = await QRCode.toDataURL(payload, { ...QR_IMAGE_OPTIONS, width: 800 });
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}
