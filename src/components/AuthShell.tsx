import { Link, useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/login" className="mb-8 flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">AI Invoice</div>
              <div className="text-[11px] text-muted-foreground">Saudi Arabia</div>
            </div>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
      <div className="hidden bg-gradient-to-br from-primary/95 via-primary to-primary/80 p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> ZATCA Phase 2 · e-invoicing ready
          </div>
          <h2 className="mt-6 max-w-md text-3xl font-semibold leading-tight">
            Turn any document into a compliant Saudi invoice — instantly.
          </h2>
          <p className="mt-3 max-w-md text-sm text-primary-foreground/80">
            Upload PDFs, images, or scans. Our AI extracts fields, verifies VAT at 15%, and generates a QR code your accountants can trust.
          </p>
        </div>
        <div className="grid gap-3 max-w-md">
          {["AI-extracted fields with editable review", "VAT & totals validated to KSA rules", "Bilingual Arabic / English templates"].map((t) => (
            <div key={t} className="rounded-xl bg-white/10 px-4 py-3 text-sm backdrop-blur">{t}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { useNavigate };
