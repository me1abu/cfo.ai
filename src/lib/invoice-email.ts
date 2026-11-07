import { computeTotals, formatMoney, isCreditNote, type Invoice } from "./invoice-math";
import { documentTitle } from "./zatca-rules";

/** Sender header showing the company's name at the app's verified address. */
export function senderHeader(companyName: string, emailFrom: string) {
  const address = emailFrom.match(/<([^>]+)>/)?.[1] ?? emailFrom.trim();
  const name = companyName.replace(/["\\<>\r\n]/g, "").trim();
  return name ? `"${name}" <${address}>` : address;
}

/** Subject and plain-text body in English and Arabic for sending a document to a customer. */
export function invoiceEmailContent(inv: Invoice, companyName: string) {
  const title = documentTitle(inv);
  const amount = formatMoney(computeTotals(inv.items).total, inv.currency);
  const due = isCreditNote(inv) ? "" : ` Due date: ${inv.dueDate}.`;
  const dueAr = isCreditNote(inv) ? "" : ` تاريخ الاستحقاق: ${inv.dueDate}.`;
  return {
    subject: `${title.en} ${inv.number} from ${companyName}`.replace(/[\r\n]+/g, " "),
    text: [
      `Dear ${inv.customerName},`,
      `Please find attached ${title.en} ${inv.number} for ${amount}.${due}`,
      companyName,
      "---",
      `السادة ${inv.customerName}،`,
      `مرفق ${title.ar} رقم ${inv.number} بمبلغ ${amount}.${dueAr}`,
      companyName,
    ].join("\n\n"),
  };
}
