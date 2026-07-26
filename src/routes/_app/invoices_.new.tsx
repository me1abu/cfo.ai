import { createFileRoute, useNavigate, Link, useParams } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QrPreview } from "@/components/QrPreview";
import { useStore, upsertInvoice, computeTotals, nextInvoiceNumber, formatMoney, type Invoice, type InvoiceItem } from "@/lib/store";
import { Trash2, Plus, Save, Eye, FileDown, QrCode, ShieldCheck, Mail, Printer, ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/invoices_.new")({
  head: () => ({ meta: [{ title: "New invoice · AI Invoice Saudi" }, { name: "description", content: "Create a new invoice." }] }),
  component: () => <InvoiceEditor mode="new" />,
});

export function InvoiceEditor({ mode, id }: { mode: "new" | "edit"; id?: string }) {
  const store = useStore((s) => s);
  const navigate = useNavigate();
  const existing = mode === "edit" ? store.invoices.find((i) => i.id === id) : undefined;
  const [inv, setInv] = useState<Invoice>(() => existing ?? {
    id: `inv_${Date.now()}`,
    number: nextInvoiceNumber(store.invoices),
    date: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    customerId: "",
    customerName: "",
    customerVat: "",
    customerAddress: "",
    currency: store.company.currency,
    items: [{ id: `it_${Date.now()}`, description: "", quantity: 1, unitPrice: 0, discount: 0, vatRate: store.company.vatRate }],
    status: "draft",
    template: "modern",
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const totals = useMemo(() => computeTotals(inv.items), [inv.items]);

  const update = (patch: Partial<Invoice>) => setInv((prev) => ({ ...prev, ...patch }));
  const updateItem = (idx: number, patch: Partial<InvoiceItem>) =>
    setInv((prev) => ({ ...prev, items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  const addItem = () => setInv((prev) => ({ ...prev, items: [...prev.items, { id: `it_${Date.now()}`, description: "", quantity: 1, unitPrice: 0, discount: 0, vatRate: store.company.vatRate }] }));
  const removeItem = (idx: number) => setInv((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const save = (status?: Invoice["status"]) => {
    if (!inv.customerName.trim()) return toast.error("Customer name is required");
    if (inv.items.every((i) => !i.description.trim())) return toast.error("Add at least one item");
    const toSave = status ? { ...inv, status } : inv;
    upsertInvoice(toSave);
    toast.success(mode === "new" ? "Invoice created" : "Invoice saved");
    navigate({ to: "/invoices/$id", params: { id: toSave.id } });
  };

  const pickCustomer = (id: string) => {
    const c = store.customers.find((x) => x.id === id);
    if (c) update({ customerId: c.id, customerName: c.name, customerVat: c.vatNumber, customerAddress: c.address });
  };

  const qrValue = `Seller:${store.company.name}|VAT:${store.company.vatNumber}|Date:${inv.date}|Total:${totals.total.toFixed(2)}|VAT:${totals.vat.toFixed(2)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={mode === "new" ? "Create invoice" : `Edit ${inv.number}`}
        subtitle="Fill the fields below or upload a document to auto-fill with AI"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><Link to="/invoices"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link></Button>
            <Button variant="outline" onClick={() => save("draft")}><Save className="mr-1 h-4 w-4" /> Save draft</Button>
            <Button variant="outline" onClick={() => setPreviewOpen(true)}><Eye className="mr-1 h-4 w-4" /> Preview</Button>
            <Button variant="outline" onClick={() => setQrOpen(true)}><QrCode className="mr-1 h-4 w-4" /> Generate QR</Button>
            <Button variant="outline" onClick={() => { toast.success("PDF generated (demo)"); }}><FileDown className="mr-1 h-4 w-4" /> Generate PDF</Button>
            <Button onClick={() => save("unpaid")}>Save & finalize</Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-soft">
            <CardHeader><CardTitle className="text-base">Invoice details</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Invoice number</Label><Input value={inv.number} onChange={(e) => update({ number: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Currency</Label>
                <Select value={inv.currency} onValueChange={(v) => update({ currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["SAR","USD","EUR","AED"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Invoice date</Label><Input type="date" value={inv.date} onChange={(e) => update({ date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Due date</Label><Input type="date" value={inv.dueDate} onChange={(e) => update({ dueDate: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Template</Label>
                <Select value={inv.template} onValueChange={(v: any) => update({ template: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modern">Modern</SelectItem>
                    <SelectItem value="corporate">Corporate</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                    <SelectItem value="arabic">Arabic</SelectItem>
                    <SelectItem value="bilingual">Arabic-English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Status</Label>
                <Select value={inv.status} onValueChange={(v: any) => update({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["draft","unpaid","paid","overdue"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label>Select existing customer</Label>
                <Select value={inv.customerId || undefined} onValueChange={pickCustomer}>
                  <SelectTrigger><SelectValue placeholder="Or fill fields below manually…" /></SelectTrigger>
                  <SelectContent>{store.customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Customer name</Label><Input value={inv.customerName} onChange={(e) => update({ customerName: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>VAT number</Label><Input value={inv.customerVat} onChange={(e) => update({ customerVat: e.target.value })} placeholder="15 digits" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label><Textarea value={inv.customerAddress} onChange={(e) => update({ customerAddress: e.target.value })} /></div>
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Items</CardTitle>
              <Button variant="outline" size="sm" onClick={addItem}><Plus className="mr-1 h-4 w-4" /> Add row</Button>
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
                    {inv.items.map((it, i) => {
                      const sub = it.quantity * it.unitPrice - it.discount;
                      return (
                        <tr key={it.id} className="border-b last:border-0">
                          <td className="py-2 pr-2"><Input value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} placeholder="Line description" /></td>
                          <td className="py-2 pr-2"><Input type="number" min={0} value={it.quantity} onChange={(e) => updateItem(i, { quantity: +e.target.value })} /></td>
                          <td className="py-2 pr-2"><Input type="number" min={0} step={0.01} value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: +e.target.value })} /></td>
                          <td className="py-2 pr-2"><Input type="number" min={0} step={0.01} value={it.discount} onChange={(e) => updateItem(i, { discount: +e.target.value })} /></td>
                          <td className="py-2 pr-2"><Input type="number" min={0} value={it.vatRate} onChange={(e) => updateItem(i, { vatRate: +e.target.value })} /></td>
                          <td className="py-2 pr-2 text-right font-medium">{formatMoney(sub, inv.currency)}</td>
                          <td className="py-2"><Button variant="ghost" size="icon" onClick={() => removeItem(i)} disabled={inv.items.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent><Textarea rows={3} placeholder="Payment terms, references, thanks…" value={inv.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} /></CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-soft sticky top-20">
            <CardHeader><CardTitle className="text-base">Totals</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatMoney(totals.subtotal, inv.currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span>{formatMoney(totals.vat, inv.currency)}</span></div>
              <div className="mt-2 border-t pt-2 flex justify-between text-base font-semibold"><span>Grand total</span><span>{formatMoney(totals.total, inv.currency)}</span></div>
              <div className="pt-4 space-y-2">
                <Button variant="outline" className="w-full" onClick={() => toast.success("Invoice validated (demo)")}><ShieldCheck className="mr-1 h-4 w-4" /> Validate</Button>
                <Button variant="outline" className="w-full" onClick={() => toast.success("PDF downloaded (demo)")}><FileDown className="mr-1 h-4 w-4" /> Download PDF</Button>
                <Button variant="outline" className="w-full" onClick={() => toast.success("Email queued (demo)")}><Mail className="mr-1 h-4 w-4" /> Email invoice</Button>
                <Button variant="outline" className="w-full" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" /> Print</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Invoice preview — {inv.template}</DialogTitle></DialogHeader>
          <InvoiceRender inv={inv} totals={totals} />
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>ZATCA-style QR</DialogTitle></DialogHeader>
          <div className="grid place-items-center py-4"><QrPreview value={qrValue} size={220} /></div>
          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground break-all">{qrValue}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(qrValue); toast.success("Payload copied"); }}>Copy</Button>
            <Button onClick={() => toast.success("QR image downloaded (demo)")}>Download QR</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function InvoiceRender({ inv, totals }: { inv: Invoice; totals: ReturnType<typeof computeTotals> }) {
  const company = useStore((s) => s.company);
  const bilingual = inv.template === "bilingual" || inv.template === "arabic";
  return (
    <div className="rounded-lg border bg-white p-8 text-sm text-neutral-900">
      <div className="flex items-start justify-between border-b pb-4">
        <div>
          <div className="text-lg font-semibold">{company.name}</div>
          <div className="text-xs text-neutral-500">{company.address}</div>
          <div className="text-xs text-neutral-500">VAT: {company.vatNumber} · CR: {company.crNumber}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tracking-tight">{bilingual ? "فاتورة ضريبية · Tax Invoice" : "Tax Invoice"}</div>
          <div className="mt-1 text-xs text-neutral-500">{inv.number}</div>
          <div className="text-xs text-neutral-500">{inv.date} → {inv.dueDate}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs text-neutral-500">{bilingual ? "الفاتورة إلى · Bill to" : "Bill to"}</div>
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
          <tr><th className="py-2 text-left">Description</th><th>Qty</th><th>Unit</th><th>Disc</th><th>VAT</th><th className="text-right">Total</th></tr>
        </thead>
        <tbody>
          {inv.items.map((it) => {
            const sub = it.quantity * it.unitPrice - it.discount;
            return <tr key={it.id} className="border-b last:border-0"><td className="py-2">{it.description}</td><td className="text-center">{it.quantity}</td><td className="text-center">{it.unitPrice.toFixed(2)}</td><td className="text-center">{it.discount.toFixed(2)}</td><td className="text-center">{it.vatRate}%</td><td className="text-right">{sub.toFixed(2)}</td></tr>;
          })}
        </tbody>
      </table>
      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span>{totals.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">VAT</span><span>{totals.vat.toFixed(2)}</span></div>
          <div className="flex justify-between border-t pt-1 font-semibold"><span>Total {inv.currency}</span><span>{totals.total.toFixed(2)}</span></div>
        </div>
      </div>
      <div className="mt-6 border-t pt-3 text-xs text-neutral-500">{company.footer}</div>
    </div>
  );
}
