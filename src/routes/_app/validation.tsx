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
import { validateInvoice } from "@/lib/zatca-rules";
import { UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";

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

function Validation() {
  const { data: invoices } = useSuspenseQuery(invoicesQuery());
  const { data: company } = useSuspenseQuery(companyQuery());
  const [source, setSource] = useState<"upload" | "existing">("existing");
  const [selectedId, setSelectedId] = useState(invoices[0]?.id ?? "");
  const selected = invoices.find((i) => i.id === selectedId);
  const report = useMemo(
    () => (selected ? validateInvoice(selected, company) : null),
    [selected, company],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoice Validation"
        subtitle="Check an invoice against ZATCA's tax-invoice requirements before you send it."
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
            <div className="rounded-xl border-2 border-dashed p-8 text-center text-sm text-muted-foreground">
              <UploadCloud className="mx-auto h-8 w-8" />
              <div className="mt-2">
                Validating invoices from other suppliers needs AI document reading, which arrives in
                Phase 3.
              </div>
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
    </div>
  );
}
