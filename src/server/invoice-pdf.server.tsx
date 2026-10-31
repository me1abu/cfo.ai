/* eslint-disable react-refresh/only-export-components -- server-only PDF module, never hot-reloaded in the browser */
/**
 * Bilingual (Arabic/English) tax-invoice PDF, rendered on the server with @react-pdf/renderer.
 *
 * Arabic rendering: @react-pdf/renderer 4.9.0 was tested with several Arabic fonts. Cairo
 * (vendored, SIL OFL) rendered correctly: joined letters, dots, lam-alef ligatures and
 * mixed-direction lines with `direction: "rtl"`. Noto Naskh Arabic misplaced dots, and Noto Sans
 * Arabic, IBM Plex Sans Arabic and Tajawal rendered right-to-left lines blank. Keep the library
 * version pinned and re-check the sample in test-output/ after changing fonts or upgrading.
 *
 * Arabic labels follow ZATCA's sample invoices in the "Guideline for Tax Invoicing and Records
 * under VAT Provisions" annex. Labels not shown there ("Customer VAT number", "Discount", ...)
 * mirror that wording.
 */
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import cairoRegular from "@/assets/fonts/Cairo-Regular.ttf?inline";
import cairoBold from "@/assets/fonts/Cairo-Bold.ttf?inline";
import notoSansRegular from "@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?inline";
import notoSansBold from "@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?inline";
import {
  computeTotals,
  lineSubtotal,
  round2,
  type Company,
  type Invoice,
} from "@/lib/invoice-math";
import { buildPhase1Qr, invoiceQrTimestamp, ZatcaQrError } from "@/lib/zatca-qr";
import { documentTitle } from "@/lib/zatca-rules";
import { QR_IMAGE_OPTIONS } from "@/lib/invoice-qr";

/**
 * Registers fresh font instances. Must be called before every render.
 *
 * react-pdf keeps one parsed font per registration and reuses it across documents. Reusing it
 * drops glyphs in later documents: in testing, every word-initial "ه" vanished from the second
 * PDF rendered in a process ("هيئة" became "يئة"). Font.reset() doesn't help (it clears the data
 * but not the cached load promise), so we replace our registrations before each render.
 */
function registerFreshFonts() {
  // Drop only our families (Font.clear() would also remove the built-in Helvetica that react-pdf
  // falls back to). getRegisteredFonts() returns the live registry object.
  const registry = Font.getRegisteredFonts() as Record<string, unknown>;
  delete registry["Noto Sans"];
  delete registry["Cairo"];
  Font.register({
    family: "Noto Sans",
    fonts: [
      { src: notoSansRegular, fontWeight: 400 },
      { src: notoSansBold, fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Cairo",
    fonts: [
      { src: cairoRegular, fontWeight: 400 },
      { src: cairoBold, fontWeight: 700 },
    ],
  });
  // Never hyphenate: it splits Arabic words and invoice identifiers.
  Font.registerHyphenationCallback((word) => [word]);
}

// Font registration is global, so a render must not overlap another render's re-registration.
let renderQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = renderQueue.then(task, task);
  renderQueue = run.catch(() => undefined);
  return run;
}

const L = {
  invoiceNumber: { en: "Invoice number", ar: "رقم الفاتورة" },
  invoiceDate: { en: "Invoice date", ar: "تاريخ الفاتورة" },
  issueTime: { en: "Invoice issuance time", ar: "توقيت إصدار الفاتورة" },
  dueDate: { en: "Payment due date", ar: "تاريخ الاستحقاق" },
  supplier: { en: "Supplier", ar: "المورد" },
  customer: { en: "Customer", ar: "العميل" },
  supplierVat: { en: "VAT registration number", ar: "رقم التسجيل الضريبي للمورد" },
  customerVat: { en: "VAT registration number", ar: "رقم التسجيل الضريبي للعميل" },
  cr: { en: "Commercial registration", ar: "السجل التجاري" },
  description: { en: "Goods or services", ar: "تفاصيل السلع أو الخدمات" },
  unitPrice: { en: "Unit price", ar: "سعر الوحدة" },
  quantity: { en: "Qty", ar: "الكمية" },
  discount: { en: "Discount", ar: "الخصم" },
  taxable: { en: "Taxable amount", ar: "المبلغ الخاضع للضريبة" },
  rate: { en: "VAT rate", ar: "نسبة الضريبة" },
  vat: { en: "VAT", ar: "الضريبة" },
  lineTotal: { en: "Total", ar: "المجموع" },
  totalExVat: { en: "Total (excluding VAT)", ar: "الإجمالي (باستثناء ضريبة القيمة المضافة)" },
  totalVat: { en: "Total VAT", ar: "مجموع ضريبة القيمة المضافة" },
  totalDue: { en: "Total amount due", ar: "إجمالي المبلغ المستحق" },
  notes: { en: "Notes", ar: "ملاحظات" },
  bank: { en: "Bank details", ar: "تفاصيل الحساب البنكي" },
  draft: { en: "DRAFT", ar: "مسودة" },
  // Credit-note wording follows ZATCA's credit-note samples in the TIG annex.
  noteNumber: { en: "Credit note number", ar: "رقم الإشعار" },
  noteDate: { en: "Credit note date", ar: "تاريخ الإشعار" },
  reason: { en: "Reason", ar: "سبب الإصدار" },
  totalCredit: { en: "Total credit amount", ar: "إجمالي مبلغ الإشعار" },
} as const;

const C = {
  ink: "#111827",
  muted: "#6b7280",
  line: "#e5e7eb",
  head: "#f3f4f6",
  brand: "#047857",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: 32,
    fontFamily: ["Noto Sans", "Cairo"],
    fontSize: 8.5,
    color: C.ink,
  },
  ar: { direction: "rtl", textAlign: "right" },
  muted: { color: C.muted },
  bold: { fontWeight: 700 },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  titleAr: { fontSize: 18, fontWeight: 700, direction: "rtl", textAlign: "right", color: C.brand },
  titleEn: { fontSize: 11, fontWeight: 700, textAlign: "right", letterSpacing: 0.5 },
  sellerName: { fontSize: 13, fontWeight: 700, marginBottom: 2 },
  meta: {
    borderTop: `1pt solid ${C.line}`,
    borderBottom: `1pt solid ${C.line}`,
    paddingVertical: 6,
    marginBottom: 12,
  },
  metaRow: { flexDirection: "row", alignItems: "center", paddingVertical: 1.5 },
  metaEn: { width: "32%", color: C.muted },
  metaVal: { flex: 1, textAlign: "center", fontWeight: 700 },
  metaAr: { width: "32%", color: C.muted, direction: "rtl", textAlign: "right" },
  parties: { flexDirection: "row", gap: 10, marginBottom: 14 },
  party: { flex: 1, border: `1pt solid ${C.line}`, borderRadius: 4, padding: 8 },
  partyHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    fontWeight: 700,
    color: C.brand,
  },
  pairLabel: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    color: C.muted,
    fontSize: 7.5,
  },
  table: { border: `1pt solid ${C.line}`, borderRadius: 4 },
  th: { flexDirection: "row", backgroundColor: C.head, borderBottom: `1pt solid ${C.line}` },
  tr: { flexDirection: "row", borderBottom: `1pt solid ${C.line}` },
  cell: { paddingVertical: 4, paddingHorizontal: 3 },
  thEn: { fontSize: 7, fontWeight: 700, textAlign: "center" },
  thAr: { fontSize: 7, direction: "rtl", textAlign: "center", color: C.muted },
  num: { textAlign: "right" },
  bottom: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, gap: 12 },
  totals: { width: 270 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottom: `1pt solid ${C.line}`,
  },
  totalDue: { borderBottom: 0, borderTop: `1.5pt solid ${C.ink}`, marginTop: 2 },
  creditBox: {
    border: `1pt solid ${C.line}`,
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
    backgroundColor: C.head,
  },
  qrBox: { alignItems: "center" },
  qr: { width: 104, height: 104 },
  section: { marginTop: 14 },
  footer: {
    position: "absolute",
    left: 32,
    right: 32,
    bottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.muted,
  },
  watermark: {
    position: "absolute",
    top: 330,
    left: 60,
    right: 60,
    alignItems: "center",
    transform: "rotate(-30deg)",
    opacity: 0.12,
  },
  watermarkText: { fontSize: 72, fontWeight: 700, color: C.ink },
});

/** react-pdf's Style type, derived because the package doesn't re-export it. */
type PdfStyle = Parameters<typeof StyleSheet.create>[0][string];

const hasArabic = (v: string) => /[؀-ۿ]/.test(v);
/** Text whose base direction follows its content (company names, addresses, descriptions). */
function Auto({ value, style }: { value: string; style?: PdfStyle | PdfStyle[] }) {
  return <Text style={[hasArabic(value) ? { direction: "rtl" } : {}, style]}>{value}</Text>;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ZATCA's guideline requires numeric dates as day/month/year. */
const dmy = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const riyadhTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Riyadh",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const COLS = [
  { key: "description", width: "auto", label: L.description },
  { key: "unitPrice", width: 54, label: L.unitPrice },
  { key: "quantity", width: 34, label: L.quantity },
  { key: "discount", width: 46, label: L.discount },
  { key: "taxable", width: 60, label: L.taxable },
  { key: "rate", width: 36, label: L.rate },
  { key: "vat", width: 50, label: L.vat },
  { key: "lineTotal", width: 60, label: L.lineTotal },
] as const;
const colStyle = (w: number | "auto") => (w === "auto" ? { flex: 1 } : { width: w });

function MetaRow({ label, value }: { label: { en: string; ar: string }; value: string }) {
  return (
    <View style={s.metaRow}>
      <Text style={s.metaEn}>{label.en}</Text>
      <Text style={s.metaVal}>{value}</Text>
      <Text style={s.metaAr}>{label.ar}</Text>
    </View>
  );
}

function PairLabel({ label }: { label: { en: string; ar: string } }) {
  return (
    <View style={s.pairLabel}>
      <Text>{label.en}</Text>
      <Text style={s.ar}>{label.ar}</Text>
    </View>
  );
}

export interface InvoicePdfProps {
  invoice: Invoice;
  company: Company;
  /** PNG data URL of the ZATCA QR code, or null with a reason. */
  qr: { dataUrl: string } | { error: string };
  /** For credit notes: the invoice being amended. */
  original?: { number: string; date: string } | null;
}

export function InvoicePdf({ invoice: inv, company, qr, original }: InvoicePdfProps) {
  const title = documentTitle(inv);
  const isCredit = inv.documentType === "credit_note";
  const totals = computeTotals(inv.items);
  const cur = inv.currency;
  const isDraft = inv.status === "draft";

  return (
    <Document
      title={`${title.en} ${inv.number}`}
      author={company.name}
      subject={`${title.en} ${inv.number}`}
      creator="AI Invoice Saudi"
      language="ar-SA"
    >
      <Page size="A4" style={s.page}>
        {isDraft && (
          <View style={s.watermark} fixed>
            <Text style={s.watermarkText}>
              {L.draft.en} · {L.draft.ar}
            </Text>
          </View>
        )}

        <View style={s.header}>
          <View style={{ width: "55%" }}>
            <Auto value={company.name} style={s.sellerName} />
            {company.address ? <Auto value={company.address} style={s.muted} /> : null}
          </View>
          <View style={{ width: "42%" }}>
            <Text style={s.titleAr}>{title.ar}</Text>
            <Text style={s.titleEn}>{title.en.toUpperCase()}</Text>
          </View>
        </View>

        <View style={s.meta}>
          <MetaRow label={isCredit ? L.noteNumber : L.invoiceNumber} value={inv.number} />
          <MetaRow label={isCredit ? L.noteDate : L.invoiceDate} value={dmy(inv.date)} />
          <MetaRow
            label={L.issueTime}
            value={inv.issuedAt ? riyadhTime.format(new Date(inv.issuedAt)) : "—"}
          />
          {isCredit ? null : <MetaRow label={L.dueDate} value={dmy(inv.dueDate)} />}
        </View>

        {isCredit ? (
          <View style={s.creditBox}>
            {original ? (
              <>
                <Text>
                  This credit note relates to invoice number ({original.number}), issued on{" "}
                  {dmy(original.date)}
                </Text>
                <Text style={s.ar}>
                  {`هذا الإشعار الدائن يتعلق بالفاتورة رقم (${original.number}) الصادرة بتاريخ ${dmy(original.date)}`}
                </Text>
              </>
            ) : null}
            <PairLabel label={L.reason} />
            <Auto value={inv.reason || "—"} style={s.bold} />
          </View>
        ) : null}

        <View style={s.parties}>
          <View style={s.party}>
            <View style={s.partyHead}>
              <Text>{L.supplier.en}</Text>
              <Text style={s.ar}>{L.supplier.ar}</Text>
            </View>
            <Auto value={company.name} style={s.bold} />
            {company.address ? <Auto value={company.address} /> : null}
            <PairLabel label={L.supplierVat} />
            <Text style={s.bold}>{company.vatNumber || "—"}</Text>
            {company.crNumber ? (
              <>
                <PairLabel label={L.cr} />
                <Text>{company.crNumber}</Text>
              </>
            ) : null}
          </View>
          <View style={s.party}>
            <View style={s.partyHead}>
              <Text>{L.customer.en}</Text>
              <Text style={s.ar}>{L.customer.ar}</Text>
            </View>
            <Auto value={inv.customerName || "—"} style={s.bold} />
            {inv.customerAddress ? <Auto value={inv.customerAddress} /> : null}
            {inv.customerVat ? (
              <>
                <PairLabel label={L.customerVat} />
                <Text style={s.bold}>{inv.customerVat}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={s.table}>
          <View style={s.th} fixed>
            {COLS.map((c) => (
              <View key={c.key} style={[s.cell, colStyle(c.width)]}>
                <Text style={s.thEn}>{c.label.en}</Text>
                <Text style={s.thAr}>{c.label.ar}</Text>
              </View>
            ))}
          </View>
          {inv.items.map((it, i) => {
            const taxable = lineSubtotal(it);
            const vat = round2(taxable * (it.vatRate / 100));
            return (
              <View
                key={it.id}
                style={[s.tr, i === inv.items.length - 1 ? { borderBottom: 0 } : {}]}
                wrap={false}
              >
                <View style={[s.cell, colStyle("auto")]}>
                  <Auto value={it.description} />
                </View>
                <Text style={[s.cell, s.num, colStyle(54)]}>{money(it.unitPrice)}</Text>
                <Text style={[s.cell, s.num, colStyle(34)]}>{it.quantity}</Text>
                <Text style={[s.cell, s.num, colStyle(46)]}>{money(it.discount)}</Text>
                <Text style={[s.cell, s.num, colStyle(60)]}>{money(taxable)}</Text>
                <Text style={[s.cell, s.num, colStyle(36)]}>{it.vatRate}%</Text>
                <Text style={[s.cell, s.num, colStyle(50)]}>{money(vat)}</Text>
                <Text style={[s.cell, s.num, colStyle(60), s.bold]}>
                  {money(round2(taxable + vat))}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={s.bottom} wrap={false}>
          <View style={s.qrBox}>
            {"dataUrl" in qr ? (
              <Image src={qr.dataUrl} style={s.qr} />
            ) : (
              <Text style={{ color: "#b91c1c", width: 150 }}>QR code unavailable: {qr.error}</Text>
            )}
          </View>
          <View style={s.totals}>
            {[
              { label: L.totalExVat, value: totals.subtotal },
              { label: L.totalVat, value: totals.vat },
            ].map((r) => (
              <View key={r.label.en} style={s.totalRow}>
                <View style={{ flex: 1 }}>
                  <Text>{r.label.en}</Text>
                  <Text style={[s.ar, s.muted, { fontSize: 7.5 }]}>{r.label.ar}</Text>
                </View>
                <Text style={{ width: 100, textAlign: "right" }}>
                  {cur} {money(r.value)}
                </Text>
              </View>
            ))}
            <View style={[s.totalRow, s.totalDue]}>
              <View style={{ flex: 1 }}>
                <Text style={s.bold}>{(isCredit ? L.totalCredit : L.totalDue).en}</Text>
                <Text style={[s.ar, s.bold]}>{(isCredit ? L.totalCredit : L.totalDue).ar}</Text>
              </View>
              <Text style={[s.bold, { width: 100, textAlign: "right", fontSize: 11 }]}>
                {cur} {money(totals.total)}
              </Text>
            </View>
          </View>
        </View>

        {inv.notes ? (
          <View style={s.section} wrap={false}>
            <PairLabel label={L.notes} />
            <Auto value={inv.notes} />
          </View>
        ) : null}
        {company.bank ? (
          <View style={s.section} wrap={false}>
            <PairLabel label={L.bank} />
            <Auto value={company.bank} />
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Auto value={company.footer || company.name} />
          <Text
            render={({ pageNumber, totalPages }) => `${inv.number} · ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

/** Builds the QR image for the PDF. Missing seller data yields an explanation, not a crash. */
export async function buildPdfQr(inv: Invoice, company: Company): Promise<InvoicePdfProps["qr"]> {
  try {
    const totals = computeTotals(inv.items);
    const payload = buildPhase1Qr({
      sellerName: company.name,
      vatNumber: company.vatNumber,
      timestamp: invoiceQrTimestamp(inv.date, inv.issuedAt),
      total: totals.total,
      vatTotal: totals.vat,
    });
    return { dataUrl: await QRCode.toDataURL(payload, { ...QR_IMAGE_OPTIONS, width: 400 }) };
  } catch (err) {
    if (err instanceof ZatcaQrError) return { error: err.message };
    throw err;
  }
}

export async function renderInvoicePdf(
  invoice: Invoice,
  company: Company,
  original: InvoicePdfProps["original"] = null,
): Promise<Buffer> {
  const qr = await buildPdfQr(invoice, company);
  return serialized(() => {
    registerFreshFonts();
    return renderToBuffer(
      <InvoicePdf invoice={invoice} company={company} qr={qr} original={original} />,
    );
  });
}
