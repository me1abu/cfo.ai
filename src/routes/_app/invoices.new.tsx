import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ZatcaQrCode } from "@/components/ZatcaQrCode";
import { downloadQrPng, useInvoiceQr } from "@/lib/invoice-qr";
import { parseZatcaQr, QR_TAG_LABELS } from "@/lib/zatca-qr";
import { INVOICE_TITLES, invoiceKind, validateInvoice } from "@/lib/zatca-rules";
import { ValidationReportView } from "@/components/ValidationReportView";
import {
  computeTotals,
  formatMoney,
  lineSubtotal,
  nextInvoiceNumber,
  plusDaysISO,
  todayISO,
  type Invoice,
  type InvoiceItem,
} from "@/lib/invoice-math";
import { companyQuery, customersQuery, invoiceQuery, invoicesQuery } from "@/lib/queries";
import { saveInvoice } from "@/server/invoices";
import { getInvoicePdf } from "@/server/pdf";
import { downloadBase64 } from "@/lib/download";
import {
  Trash2,
  Plus,
  Save,
  Eye,
  FileDown,
  QrCode,
  ShieldCheck,
  Mail,
  Printer,
  ArrowLeft,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/invoices/new")({
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(companyQuery()),
      queryClient.ensureQueryData(customersQuery()),
      queryClient.ensureQueryData(invoicesQuery()),
    ]);
  },
  head: () => ({
    meta: [
      { title: "New invoice · AI Invoice Saudi" },
      { name: "description", content: "Create a new invoice." },
    ],
  }),
  component: NewInvoice,
});

function NewInvoice() {
  const { data: company } = useSuspenseQuery(companyQuery());
  const { data: invoices } = useSuspenseQuery(invoicesQuery());
  const initial = useMemo<Invoice>(
    () => ({
      id: "",
      number: nextInvoiceNumber(invoices),
      date: todayISO(),
      dueDate: plusDaysISO(30),
      customerId: null,
      customerName: "",
      customerVat: "",
      customerAddress: "",
      currency: company.currency,
      items: [newItem(company.vatRate)],
      status: "draft",
      notes: "",
      template: "bilingual",
      issuedAt: null,
    }),
    // Only compute once for the new-invoice form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return <InvoiceEditor mode="new" initial={initial} />;
}

let tmpCounter = 0;
function newItem(vatRate: number): InvoiceItem {
  return {
    id: `tmp_${++tmpCounter}_${Date.now()}`,
    description: "",
    quantity: 1,
    unitPrice: 0,
    discount: 0,
    vatRate,
  };
}

export function InvoiceEditor({ mode, initial }: { mode: "new" | "edit"; initial: Invoice }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: company } = useSuspenseQuery(companyQuery());
  const { data: customers } = useSuspenseQuery(customersQuery());
  const [inv, setInv] = useState<Invoice>(initial);
  // Snapshot of the last saved state, so PDFs are only generated from saved data.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initial));
  const dirty = JSON.stringify(inv) !== savedSnapshot;
  const [pdfBusy, setPdfBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [validateOpen, setValidateOpen] = useState(false);

  const totals = useMemo(() => computeTotals(inv.items), [inv.items]);
  const report = useMemo(
    () => (validateOpen ? validateInvoice(inv, company) : null),
    [validateOpen, inv, company],
  );

  const update = (patch: Partial<Invoice>) => setInv((prev) => ({ ...prev, ...patch }));
  const updateItem = (idx: number, patch: Partial<InvoiceItem>) =>
    setInv((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  const addItem = () =>
    setInv((prev) => ({ ...prev, items: [...prev.items, newItem(company.vatRate)] }));
  const removeItem = (idx: number) =>
    setInv((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const mutation = useMutation({
    mutationFn: (toSave: Invoice) =>
      saveInvoice({
        data: {
          ...toSave,
          id: toSave.id || undefined,
          items: toSave.items.map(({ id: _id, ...rest }) => rest),
        },
      }),
    onSuccess: async (res) => {
      if (!res.ok) return toast.error(res.error);
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(mode === "new" ? "Invoice created" : "Invoice saved");
      if (mode === "new") {
        navigate({ to: "/invoices/$id", params: { id: res.id } });
      } else {
        // Reload from the server so server-set fields (e.g. the issue timestamp) are current.
        const fresh = await queryClient.fetchQuery(invoiceQuery(res.id));
        if (fresh) {
          setInv(fresh);
          setSavedSnapshot(JSON.stringify(fresh));
        }
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save invoice"),
  });

  const save = (status?: Invoice["status"]) => {
    if (!inv.customerName.trim()) return toast.error("Customer name is required");
    if (inv.items.every((i) => !i.description.trim())) return toast.error("Add at least one item");
    mutation.mutate(status ? { ...inv, status } : inv);
  };

  const pickCustomer = (id: string) => {
    const c = customers.find((x) => x.id === id);
    if (c)
      update({
        customerId: c.id,
        customerName: c.name,
        customerVat: c.vatNumber,
        customerAddress: c.address,
      });
  };

  const qr = useInvoiceQr(inv, company);
  const busy = mutation.isPending;

  const downloadPdf = async () => {
    if (!inv.id) return toast.error("Save the invoice first, then download the PDF.");
    if (dirty) return toast.error("You have unsaved changes. Save first so the PDF matches.");
    setPdfBusy(true);
    try {
      const res = await getInvoicePdf({ data: { id: inv.id } });
      if (!res.ok) return toast.error(res.error);
      downloadBase64(res.base64, res.filename, "application/pdf");
    } catch {
      toast.error("Could not generate the PDF");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={mode === "new" ? "Create invoice" : `Edit ${inv.number}`}
        subtitle="Fill the fields below or upload a document to auto-fill with AI"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/invoices">
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Link>
            </Button>
            <Button variant="outline" onClick={() => save("draft")} disabled={busy}>
              <Save className="mr-1 h-4 w-4" /> Save draft
            </Button>
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye className="mr-1 h-4 w-4" /> Preview
            </Button>
            <Button variant="outline" onClick={() => setQrOpen(true)}>
              <QrCode className="mr-1 h-4 w-4" /> Generate QR
            </Button>
            <Button variant="outline" onClick={downloadPdf} disabled={pdfBusy}>
              <FileDown className="mr-1 h-4 w-4" /> {pdfBusy ? "Generating…" : "Download PDF"}
            </Button>
            <Button onClick={() => save("unpaid")} disabled={busy}>
              {busy ? "Saving…" : "Save & finalize"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">Invoice details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Invoice number</Label>
                <Input value={inv.number} onChange={(e) => update({ number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={inv.currency} onValueChange={(v) => update({ currency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["SAR", "USD", "EUR", "AED"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Invoice date</Label>
                <Input
                  type="date"
                  value={inv.date}
                  onChange={(e) => update({ date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <Input
                  type="date"
                  value={inv.dueDate}
                  onChange={(e) => update({ dueDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Template</Label>
                <Select
                  value={inv.template}
                  onValueChange={(v) => update({ template: v as Invoice["template"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modern">Modern</SelectItem>
                    <SelectItem value="corporate">Corporate</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                    <SelectItem value="arabic">Arabic</SelectItem>
                    <SelectItem value="bilingual">Arabic-English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={inv.status}
                  onValueChange={(v) => update({ status: v as Invoice["status"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["draft", "unpaid", "paid", "overdue"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Select existing customer</Label>
                <Select value={inv.customerId ?? ""} onValueChange={pickCustomer}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        customers.length
                          ? "Or fill fields below manually…"
                          : "No customers yet — fill fields below"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Customer name</Label>
                <Input
                  value={inv.customerName}
                  onChange={(e) => update({ customerName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>VAT number</Label>
                <Input
                  value={inv.customerVat}
                  onChange={(e) => update({ customerVat: e.target.value })}
                  placeholder="15 digits"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Address</Label>
                <Textarea
                  value={inv.customerAddress}
                  onChange={(e) => update({ customerAddress: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Items</CardTitle>
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="mr-1 h-4 w-4" /> Add row
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Description</th>
                      <th className="pb-2 font-medium w-20">Qty</th>
                      <th className="pb-2 font-medium w-28">Unit price</th>
                      <th className="pb-2 font-medium w-24">Discount</th>
                      <th className="pb-2 font-medium w-20">VAT %</th>
                      <th className="pb-2 font-medium w-28 text-right">Subtotal</th>
                      <th className="pb-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {inv.items.map((it, i) => (
                      <tr key={it.id} className="border-b last:border-0">
                        <td className="py-2 pr-2">
                          <Input
                            value={it.description}
                            onChange={(e) => updateItem(i, { description: e.target.value })}
                            placeholder="Line description"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            min={0}
                            value={it.quantity}
                            onChange={(e) => updateItem(i, { quantity: +e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={it.unitPrice}
                            onChange={(e) => updateItem(i, { unitPrice: +e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={it.discount}
                            onChange={(e) => updateItem(i, { discount: +e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            min={0}
                            value={it.vatRate}
                            onChange={(e) => updateItem(i, { vatRate: +e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2 text-right font-medium">
                          {formatMoney(lineSubtotal(it), inv.currency)}
                        </td>
                        <td className="py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(i)}
                            disabled={inv.items.length === 1}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={3}
                placeholder="Payment terms, references, thanks…"
                value={inv.notes}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-soft sticky top-20">
            <CardHeader>
              <CardTitle className="text-base">Totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatMoney(totals.subtotal, inv.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT</span>
                <span>{formatMoney(totals.vat, inv.currency)}</span>
              </div>
              <div className="mt-2 border-t pt-2 flex justify-between text-base font-semibold">
                <span>Grand total</span>
                <span>{formatMoney(totals.total, inv.currency)}</span>
              </div>
              <div className="pt-4 space-y-2">
                <Button variant="outline" className="w-full" onClick={() => setValidateOpen(true)}>
                  <ShieldCheck className="mr-1 h-4 w-4" /> Validate
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={downloadPdf}
                  disabled={pdfBusy}
                  data-testid="download-pdf"
                >
                  <FileDown className="mr-1 h-4 w-4" /> {pdfBusy ? "Generating…" : "Download PDF"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => toast.info("Email delivery arrives in Phase 4")}
                >
                  <Mail className="mr-1 h-4 w-4" /> Email invoice
                </Button>
                <Button variant="outline" className="w-full" onClick={() => window.print()}>
                  <Printer className="mr-1 h-4 w-4" /> Print
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Invoice preview — {inv.template}</DialogTitle>
          </DialogHeader>
          <InvoiceRender inv={inv} totals={totals} />
        </DialogContent>
      </Dialog>

      <Dialog open={validateOpen} onOpenChange={setValidateOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Validation · {inv.number}</DialogTitle>
          </DialogHeader>
          {report && <ValidationReportView report={report} />}
          <p className="text-xs text-muted-foreground">
            Checks use the values on screen, including unsaved changes.
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ZATCA QR code</DialogTitle>
          </DialogHeader>
          {qr.ok ? (
            <>
              <div className="grid place-items-center py-2">
                <ZatcaQrCode payload={qr.payload} size={220} />
              </div>
              {qr.isPreview && (
                <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
                  Draft preview. The timestamp is fixed when the invoice is finalized, so the final
                  code will differ.
                </p>
              )}
              <dl className="divide-y rounded-md border text-xs">
                {parseZatcaQr(qr.payload).tags.map((t) => (
                  <div key={t.tag} className="grid grid-cols-[9rem_1fr] gap-2 px-3 py-1.5">
                    <dt className="text-muted-foreground">{QR_TAG_LABELS[t.tag]}</dt>
                    <dd className="break-all font-medium">{t.value}</dd>
                  </div>
                ))}
              </dl>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(qr.payload);
                    toast.success("QR content copied");
                  }}
                >
                  Copy content
                </Button>
                <Button
                  onClick={() => downloadQrPng(qr.payload, `${inv.number || "invoice"}-qr.png`)}
                >
                  Download PNG
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-destructive">{qr.error}</p>
              <Button variant="outline" asChild>
                <Link to="/company">Complete company profile</Link>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function InvoiceRender({
  inv,
  totals,
}: {
  inv: Invoice;
  totals: ReturnType<typeof computeTotals>;
}) {
  const { data: company } = useSuspenseQuery(companyQuery());
  const qr = useInvoiceQr(inv, company);
  const bilingual = inv.template === "bilingual" || inv.template === "arabic";
  const title = INVOICE_TITLES[invoiceKind(inv)];
  return (
    <div className="rounded-lg border bg-white p-8 text-sm text-neutral-900">
      <div className="flex items-start justify-between border-b pb-4">
        <div>
          <div className="text-lg font-semibold">{company.name}</div>
          <div className="text-xs text-neutral-500">{company.address}</div>
          <div className="text-xs text-neutral-500">
            VAT: {company.vatNumber} · CR: {company.crNumber}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tracking-tight">
            {bilingual ? `${title.ar} · ${title.en}` : title.en}
          </div>
          <div className="mt-1 text-xs text-neutral-500">{inv.number}</div>
          <div className="text-xs text-neutral-500">
            {inv.date} → {inv.dueDate}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs text-neutral-500">
            {bilingual ? "الفاتورة إلى · Bill to" : "Bill to"}
          </div>
          <div className="font-medium">{inv.customerName}</div>
          <div className="text-xs text-neutral-500 whitespace-pre-line">{inv.customerAddress}</div>
          <div className="text-xs text-neutral-500">VAT: {inv.customerVat}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-neutral-500">Currency</div>
          <div className="font-medium">{inv.currency}</div>
        </div>
      </div>
      <table className="mt-6 w-full text-sm">
        <thead className="border-b text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="py-2 text-left">Description</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Disc</th>
            <th>VAT</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it) => (
            <tr key={it.id} className="border-b last:border-0">
              <td className="py-2">{it.description}</td>
              <td className="text-center">{it.quantity}</td>
              <td className="text-center">{it.unitPrice.toFixed(2)}</td>
              <td className="text-center">{it.discount.toFixed(2)}</td>
              <td className="text-center">{it.vatRate}%</td>
              <td className="text-right">{lineSubtotal(it).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-500">Subtotal</span>
            <span>{totals.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">VAT</span>
            <span>{totals.vat.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-semibold">
            <span>Total {inv.currency}</span>
            <span>{totals.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div className="mt-6 flex items-end justify-between gap-6 border-t pt-4">
        <div className="text-xs text-neutral-500">{company.footer}</div>
        {qr.ok ? (
          <ZatcaQrCode payload={qr.payload} size={110} className="shrink-0" />
        ) : (
          <div className="w-40 shrink-0 text-right text-xs text-red-600">QR: {qr.error}</div>
        )}
      </div>
    </div>
  );
}
