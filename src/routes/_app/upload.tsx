import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  UploadCloud,
  FileText,
  ImageIcon,
  Sparkles,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { companyQuery, invoicesQuery } from "@/lib/queries";
import {
  computeTotals,
  formatMoney,
  lineSubtotal,
  nextInvoiceNumber,
  todayISO,
  type Invoice,
} from "@/lib/invoice-math";
import { extractionToInvoice, type Extraction } from "@/lib/extraction";
import { ACCEPT_ATTRIBUTE, readDocumentFile } from "@/lib/file-upload";
import { extractDocument } from "@/server/ai";
import { saveInvoice } from "@/server/invoices";

export const Route = createFileRoute("/_app/upload")({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(companyQuery()),
      queryClient.ensureQueryData(invoicesQuery()),
    ]),
  head: () => ({
    meta: [
      { title: "AI Upload · AI Invoice Saudi" },
      { name: "description", content: "Turn a document into a draft invoice with AI." },
    ],
  }),
  component: UploadPage,
});

type Phase =
  | { kind: "idle" }
  | { kind: "reading"; fileName: string }
  | { kind: "error"; fileName?: string; message: string }
  | { kind: "done"; fileName: string; extraction: Extraction };

function UploadPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [draft, setDraft] = useState<Invoice | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const { data: company } = useSuspenseQuery(companyQuery());
  const { data: invoices } = useSuspenseQuery(invoicesQuery());
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleFile = async (f: File) => {
    setDraft(null);
    const read = await readDocumentFile(f);
    if (!read.ok) return setPhase({ kind: "error", fileName: f.name, message: read.error });
    setPhase({ kind: "reading", fileName: f.name });
    try {
      const res = await extractDocument({ data: read });
      if (!res.ok) return setPhase({ kind: "error", fileName: f.name, message: res.error });
      setPhase({ kind: "done", fileName: f.name, extraction: res.extraction });
      setDraft(
        extractionToInvoice(res.extraction, {
          currency: company.currency,
          vatRate: company.vatRate,
          today: todayISO(),
        }),
      );
    } catch {
      setPhase({ kind: "error", fileName: f.name, message: "Upload failed. Please try again." });
    }
  };

  const create = useMutation({
    mutationFn: (inv: Invoice) =>
      saveInvoice({
        data: {
          ...inv,
          id: undefined,
          // The draft is an invoice from your business, so it takes your next number.
          number: nextInvoiceNumber(invoices),
          template: "bilingual",
          status: "draft",
          items: inv.items.map(({ id: _id, ...rest }) => rest),
        },
      }),
    onSuccess: async (res) => {
      if (!res.ok) return toast.error(res.error);
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Draft invoice created from the document");
      navigate({ to: "/invoices/$id", params: { id: res.id } });
    },
    onError: () => toast.error("Could not create the draft"),
  });

  const extraction = phase.kind === "done" ? phase.extraction : null;
  const sellerVat = extraction?.seller.vatNumber?.replace(/\s+/g, "") ?? "";
  const issuedBySomeoneElse =
    !!extraction?.seller.name && !!sellerVat && sellerVat !== company.vatNumber;
  const totals = draft ? computeTotals(draft.items) : null;

  const createDraft = () => {
    if (!draft || !extraction) return;
    if (!draft.customerName.trim()) return toast.error("Add the customer's name first");
    if (draft.items.length === 0) return toast.error("No line items were found in the document");
    const source = [
      extraction.invoiceNumber && `document ${extraction.invoiceNumber}`,
      extraction.seller.name && `from ${extraction.seller.name}`,
    ]
      .filter(Boolean)
      .join(" ");
    create.mutate({
      ...draft,
      notes: [draft.notes, source && `Created from ${source}.`].filter(Boolean).join("\n"),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Upload"
        subtitle="Turn a purchase order, quotation or customer request into a draft invoice. AI reads the document; you review everything before it's saved."
      />

      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div
            ref={dragRef}
            onDragOver={(e) => {
              e.preventDefault();
              dragRef.current?.classList.add("border-primary", "bg-primary/5");
            }}
            onDragLeave={() => dragRef.current?.classList.remove("border-primary", "bg-primary/5")}
            onDrop={(e) => {
              e.preventDefault();
              dragRef.current?.classList.remove("border-primary", "bg-primary/5");
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => phase.kind !== "reading" && inputRef.current?.click()}
            className="grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-border p-10 text-center transition-colors hover:border-primary hover:bg-primary/5"
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div className="mt-4 text-base font-medium">
              Drag & drop a document, or click to browse
            </div>
            <div className="mt-1 text-xs text-muted-foreground">PDF or image, up to 3 MB</div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              className="hidden"
              data-testid="upload-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1">
                <FileText className="h-3.5 w-3.5" /> PDF
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1">
                <ImageIcon className="h-3.5 w-3.5" /> Photo or scan
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {phase.kind === "reading" && (
        <Card className="shadow-soft">
          <CardContent className="flex items-center gap-3 p-6" data-testid="upload-reading">
            <Sparkles className="h-5 w-5 animate-pulse text-primary" />
            <div>
              <div className="text-sm font-medium">Reading {phase.fileName}…</div>
              <div className="text-xs text-muted-foreground">
                This usually takes 10 to 60 seconds.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {phase.kind === "error" && (
        <Card className="border-destructive/40 shadow-soft">
          <CardContent className="flex items-start gap-3 p-6 text-sm" data-testid="upload-error">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              {phase.fileName && <div className="font-medium">{phase.fileName}</div>}
              <div className="text-muted-foreground">{phase.message}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {extraction && draft && (
        <Card className="shadow-soft">
          <CardContent className="space-y-4 p-6" data-testid="upload-result">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Review the extracted details</div>
                <div className="text-xs text-muted-foreground">
                  Check every field. The draft opens in the editor, where you can change anything
                  before issuing.
                </div>
              </div>
              <Button onClick={createDraft} disabled={create.isPending}>
                {create.isPending ? "Creating…" : "Create draft invoice"}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            {(issuedBySomeoneElse || !extraction.isInvoice || extraction.warnings.length > 0) && (
              <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
                {issuedBySomeoneElse && (
                  <li>
                    This document was issued by <b>{extraction.seller.name}</b>. If it's a supplier
                    invoice you received, check it on the{" "}
                    <Link to="/validation" className="font-medium text-primary">
                      Validation page
                    </Link>{" "}
                    instead.
                  </li>
                )}
                {!extraction.isInvoice && (
                  <li>Document type: {extraction.documentKind.replace(/_/g, " ")}.</li>
                )}
                {extraction.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Customer"
                value={draft.customerName}
                onChange={(v) => setDraft({ ...draft, customerName: v })}
              />
              <Field
                label="Customer VAT number"
                value={draft.customerVat}
                onChange={(v) => setDraft({ ...draft, customerVat: v })}
              />
              <Field
                label="Invoice date"
                type="date"
                value={draft.date}
                onChange={(v) => setDraft({ ...draft, date: v })}
              />
              <Field
                label="Due date"
                type="date"
                value={draft.dueDate}
                onChange={(v) => setDraft({ ...draft, dueDate: v })}
              />
              <div className="sm:col-span-2">
                <Field
                  label="Customer address"
                  value={draft.customerAddress}
                  onChange={(v) => setDraft({ ...draft, customerAddress: v })}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Description</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Unit price</th>
                    <th className="p-2 text-right">Discount</th>
                    <th className="p-2 text-right">VAT %</th>
                    <th className="p-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-muted-foreground">
                        No line items found.
                      </td>
                    </tr>
                  )}
                  {draft.items.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="p-2">{it.description}</td>
                      <td className="p-2 text-right">{it.quantity}</td>
                      <td className="p-2 text-right">{it.unitPrice.toFixed(2)}</td>
                      <td className="p-2 text-right">{it.discount.toFixed(2)}</td>
                      <td className="p-2 text-right">{it.vatRate}%</td>
                      <td className="p-2 text-right">{lineSubtotal(it).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totals && (
              <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatMoney(totals.subtotal, draft.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT</span>
                  <span>{formatMoney(totals.vat, draft.currency)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>Total</span>
                  <span>{formatMoney(totals.total, draft.currency)}</span>
                </div>
                {extraction.statedTotals.total !== null &&
                  Math.abs(extraction.statedTotals.total - totals.total) > 0.01 && (
                    <div className="text-xs text-warning-foreground">
                      The document's printed total is{" "}
                      {formatMoney(extraction.statedTotals.total, draft.currency)}.
                    </div>
                  )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}
