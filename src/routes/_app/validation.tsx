import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ValidationReportView } from "@/components/ValidationReportView";
import { companyQuery, invoicesQuery } from "@/lib/queries";
import { originalInfoFromDocs, validateInvoice, type ValidationReport } from "@/lib/zatca-rules";
import { formatMoney } from "@/lib/invoice-math";
import type { Extraction } from "@/lib/extraction";
import { ACCEPT_ATTRIBUTE, readDocumentFile } from "@/lib/file-upload";
import { checkDocument } from "@/server/ai";
import { UploadCloud, Sparkles, AlertTriangle } from "lucide-react";
import { useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/_app/validation")({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(invoicesQuery()),
      queryClient.ensureQueryData(companyQuery()),
    ]),
  head: () => ({
    meta: [
      { title: "Invoice Validation · AI Invoice Saudi" },
      { name: "description", content: "Check invoices against Saudi VAT invoicing rules." },
    ],
  }),
  component: Validation,
});

type UploadState =
  | { kind: "idle" }
  | { kind: "reading"; fileName: string }
  | { kind: "error"; message: string }
  | { kind: "done"; fileName: string; extraction: Extraction; report: ValidationReport };

function Validation() {
  const { data: invoices } = useSuspenseQuery(invoicesQuery());
  const { data: company } = useSuspenseQuery(companyQuery());
  const [source, setSource] = useState<"upload" | "existing">("existing");
  const [selectedId, setSelectedId] = useState(invoices[0]?.id ?? "");
  const [upload, setUpload] = useState<UploadState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = invoices.find((i) => i.id === selectedId);
  const report = useMemo(
    () =>
      selected
        ? validateInvoice(selected, company, { original: originalInfoFromDocs(selected, invoices) })
        : null,
    [selected, company, invoices],
  );

  const onFile = async (f: File) => {
    const read = await readDocumentFile(f);
    if (!read.ok) return setUpload({ kind: "error", message: read.error });
    setUpload({ kind: "reading", fileName: f.name });
    try {
      const res = await checkDocument({ data: read });
      setUpload(
        res.ok
          ? { kind: "done", fileName: f.name, extraction: res.extraction, report: res.report }
          : { kind: "error", message: res.error },
      );
    } catch {
      setUpload({ kind: "error", message: "Upload failed. Please try again." });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoice Validation"
        subtitle="Check your invoices before sending them, or check an invoice a supplier sent you."
      />

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">Choose an invoice</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={source === "existing" ? "default" : "outline"}
              onClick={() => setSource("existing")}
            >
              Existing invoice
            </Button>
            <Button
              variant={source === "upload" ? "default" : "outline"}
              onClick={() => setSource("upload")}
            >
              Upload PDF / image
            </Button>
          </div>
          {source === "existing" ? (
            invoices.length ? (
              <div className="max-w-md">
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {invoices.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.number} · {i.customerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No invoices yet.{" "}
                <Link to="/invoices/new" className="font-medium text-primary">
                  Create one
                </Link>{" "}
                to validate it.
              </p>
            )
          ) : (
            <div
              className="cursor-pointer rounded-xl border-2 border-dashed p-8 text-center text-sm hover:border-primary hover:bg-primary/5"
              onClick={() => upload.kind !== "reading" && inputRef.current?.click()}
            >
              <UploadCloud className="mx-auto h-8 w-8 text-primary" />
              <div className="mt-2 font-medium">Upload an invoice you received</div>
              <div className="text-xs text-muted-foreground">
                PDF or image, up to 3 MB. AI reads it, then the app checks it against ZATCA's rules
                and its own arithmetic.
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                className="hidden"
                data-testid="validation-upload-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {source === "existing" && report && selected && (
        <Card className="shadow-soft">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Report for {selected.number}</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to="/invoices/$id" params={{ id: selected.id }}>
                Open invoice
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ValidationReportView report={report} />
          </CardContent>
        </Card>
      )}

      {source === "upload" && upload.kind === "reading" && (
        <Card className="shadow-soft">
          <CardContent className="flex items-center gap-3 p-6 text-sm">
            <Sparkles className="h-5 w-5 animate-pulse text-primary" />
            Reading {upload.fileName}… this usually takes 10 to 60 seconds.
          </CardContent>
        </Card>
      )}

      {source === "upload" && upload.kind === "error" && (
        <Card className="border-destructive/40 shadow-soft">
          <CardContent className="flex items-start gap-3 p-6 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            {upload.message}
          </CardContent>
        </Card>
      )}

      {source === "upload" && upload.kind === "done" && (
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Report for {upload.fileName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <Row label="Supplier" value={upload.extraction.seller.name} />
              <Row label="Supplier VAT number" value={upload.extraction.seller.vatNumber} />
              <Row label="Invoice number" value={upload.extraction.invoiceNumber} />
              <Row label="Issue date" value={upload.extraction.issueDate} />
              <Row label="Customer" value={upload.extraction.buyer.name} />
              <Row
                label="Printed total"
                value={
                  upload.extraction.statedTotals.total === null
                    ? null
                    : formatMoney(
                        upload.extraction.statedTotals.total,
                        upload.extraction.currency ?? "SAR",
                      )
                }
              />
            </dl>
            {upload.extraction.warnings.length > 0 && (
              <ul className="list-disc space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 pl-6 text-xs">
                {upload.extraction.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            <ValidationReportView report={upload.report} />
            <p className="text-xs text-muted-foreground">
              Values were read by AI. Compare anything important against the original document.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3 border-b py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value || "—"}</dd>
    </div>
  );
}
