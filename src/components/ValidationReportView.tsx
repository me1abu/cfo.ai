import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { ValidationReport } from "@/lib/zatca-rules";

const ORDER = { fail: 0, warn: 1, pass: 2 } as const;

export function ValidationReportView({ report }: { report: ValidationReport }) {
  const sorted = [...report.checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const { counts } = report;
  return (
    <div className="space-y-4" data-testid="validation-report">
      <div className="flex flex-wrap items-center gap-3">
        {report.ready ? (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4" />
            {counts.warn ? "Ready to issue, with warnings" : "Ready to issue"}
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-sm font-medium text-destructive">
            <XCircle className="h-4 w-4" />
            {counts.fail} problem{counts.fail === 1 ? "" : "s"} to fix
          </div>
        )}
        <span className="text-sm text-muted-foreground">
          {report.title.en} · {counts.pass} passed · {counts.warn} warning
          {counts.warn === 1 ? "" : "s"} · {counts.fail} failed
        </span>
      </div>
      <ul className="divide-y rounded-lg border">
        {sorted.map((c) => (
          <li key={c.id} className="flex items-start gap-3 px-3 py-2.5" data-status={c.status}>
            {c.status === "pass" && (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            )}
            {c.status === "warn" && (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            )}
            {c.status === "fail" && (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium">{c.title}</span>
                <span className="text-[11px] text-muted-foreground">{c.source}</span>
              </div>
              <div className="break-words text-xs text-muted-foreground">{c.detail}</div>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Checks cover ZATCA tax-invoice content rules and the Phase 1 QR code. Phase 2 integration
        (XML, cryptographic stamp and reporting to ZATCA) is not covered yet.
      </p>
    </div>
  );
}
