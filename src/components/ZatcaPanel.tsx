import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ZatcaInfo } from "@/lib/invoice-math";

const SUMMARY: Record<ZatcaInfo["status"], string> = {
  cleared: "Cleared by ZATCA. This is the legal invoice, and it can be shared.",
  reported: "Reported to ZATCA.",
  pending: "Signed, but ZATCA hasn't answered yet.",
  rejected: "ZATCA rejected this document. It's back to draft: fix the errors below and issue it.",
};

/** ZATCA's answer for a document, with its errors and warnings in ZATCA's own words. */
export function ZatcaPanel({
  zatca,
  retrying,
  onRetry,
}: {
  zatca: ZatcaInfo;
  retrying: boolean;
  onRetry: () => void;
}) {
  const accepted = zatca.status === "cleared" || zatca.status === "reported";
  const Icon = accepted ? CheckCircle2 : zatca.status === "pending" ? Clock : AlertTriangle;
  return (
    <Card className="shadow-soft" data-testid="zatca-panel" data-status={zatca.status}>
      <CardContent className="space-y-2 p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <Icon
              className={
                accepted
                  ? "h-4 w-4 text-success"
                  : zatca.status === "pending"
                    ? "h-4 w-4 text-warning"
                    : "h-4 w-4 text-destructive"
              }
            />
            {SUMMARY[zatca.status]}
          </div>
          {zatca.status === "pending" && (
            <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
              {retrying ? "Sending…" : "Retry"}
            </Button>
          )}
        </div>
        {zatca.errors.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-destructive">
            {zatca.errors.map((m) => (
              <li key={m.code + m.message}>
                {m.message} ({m.code})
              </li>
            ))}
          </ul>
        )}
        {zatca.warnings.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {zatca.warnings.map((m) => (
              <li key={m.code + m.message}>
                {m.message} ({m.code})
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
