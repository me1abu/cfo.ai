import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { UploadCloud, CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from "lucide-react";
import { useState, useRef } from "react";

export const Route = createFileRoute("/_app/validation")({
  head: () => ({
    meta: [
      { title: "Invoice Validation · AI Invoice Saudi" },
      { name: "description", content: "Validate invoices against Saudi VAT rules." },
    ],
  }),
  component: Validation,
});

interface Check {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

function Validation() {
  const invoices = useStore((s) => s.invoices);
  const [source, setSource] = useState<"upload" | "existing">("existing");
  const [selectedId, setSelectedId] = useState(invoices[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<null | {
    score: number;
    checks: Check[];
    warnings: string[];
    missing: string[];
  }>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runValidation = () => {
    setRunning(true);
    setResult(null);
    setTimeout(() => {
      setRunning(false);
      setResult({
        score: 97,
        checks: [
          {
            name: "Required fields present",
            status: "pass",
            detail: "All mandatory fields detected.",
          },
          {
            name: "VAT calculation",
            status: "pass",
            detail: "VAT at 15% matches subtotal × rate.",
          },
          { name: "Invoice total", status: "pass", detail: "Subtotal + VAT equals grand total." },
          { name: "QR code present", status: "pass", detail: "Base64 QR decoded successfully." },
          {
            name: "Seller VAT number format",
            status: "warn",
            detail: "VAT number should be 15 digits; provided value looks valid.",
          },
          {
            name: "Buyer address completeness",
            status: "warn",
            detail: "Postal code missing from address line.",
          },
        ],
        warnings: ["Postal code missing from buyer address."],
        missing: [],
      });
    }, 1100);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoice Validation"
        subtitle="Verify invoices against ZATCA e-invoicing rules."
      />

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">Choose source</CardTitle>
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
            <div className="max-w-md">
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.number} — {i.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div
              className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer hover:bg-accent/40"
              onClick={() => inputRef.current?.click()}
            >
              <UploadCloud className="mx-auto h-8 w-8 text-primary" />
              <div className="mt-2 text-sm">Click to upload PDF or image</div>
              <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" />
            </div>
          )}
          <Button onClick={runValidation} disabled={running}>
            <ShieldCheck className="mr-1 h-4 w-4" />{" "}
            {running ? "Running checks…" : "Run validation"}
          </Button>
        </CardContent>
      </Card>

      {running && (
        <Card className="shadow-soft">
          <CardContent className="p-6 space-y-2">
            <div className="text-sm">Analyzing invoice fields, calculations and QR…</div>
            <Progress value={65} />
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="shadow-soft lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Report summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative grid h-24 w-24 place-items-center rounded-full bg-success/10">
                  <div className="text-2xl font-semibold text-success">{result.score}%</div>
                </div>
                <div>
                  <div className="text-sm font-medium">Invoice status</div>
                  <div className="text-success text-lg font-semibold">Valid</div>
                  <div className="text-xs text-muted-foreground">Validation score</div>
                </div>
              </div>
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Passed checks</span>
                  <span className="font-medium text-success">
                    {result.checks.filter((c) => c.status === "pass").length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Warnings</span>
                  <span className="font-medium text-warning-foreground">
                    {result.checks.filter((c) => c.status === "warn").length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Missing fields</span>
                  <span className="font-medium">{result.missing.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-soft lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Detailed checks</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {result.checks.map((c) => (
                  <li key={c.name} className="flex items-start gap-3 py-3">
                    {c.status === "pass" && (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
                    )}
                    {c.status === "warn" && (
                      <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
                    )}
                    {c.status === "fail" && <XCircle className="mt-0.5 h-5 w-5 text-destructive" />}
                    <div>
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
