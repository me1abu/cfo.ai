import { createFileRoute, useNavigate, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { MailCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/AuthShell";
import { exchangeAuthCode, resendVerification, verifyTokenHash } from "@/server/auth";
import { toast } from "sonner";

const otpTypes = ["signup", "email", "recovery", "email_change", "invite", "magiclink"] as const;

export const Route = createFileRoute("/verify-email")({
  validateSearch: z.object({
    email: z.string().optional(),
    // PKCE flow (default Supabase template): ?code=…
    code: z.string().optional(),
    // Token-hash flow (custom template): ?token_hash=…&type=signup
    token_hash: z.string().optional(),
    type: z.enum(otpTypes).optional(),
    error_description: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Verify email · AI Invoice Saudi" },
      { name: "description", content: "Verify your email." },
    ],
  }),
  component: Page,
});

type Status = "waiting" | "verifying" | "confirmed_no_session" | "failed";

function Page() {
  const navigate = useNavigate();
  const router = useRouter();
  const search = Route.useSearch();
  const hasToken = Boolean(search.code || search.token_hash);
  const [email, setEmail] = useState(search.email ?? "");
  const [status, setStatus] = useState<Status>(hasToken ? "verifying" : "waiting");
  const [error, setError] = useState<string | null>(search.error_description ?? null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!hasToken) return;
    const run = async () => {
      const res = search.token_hash
        ? await verifyTokenHash({
            data: { tokenHash: search.token_hash, type: search.type ?? "signup" },
          })
        : await exchangeAuthCode({ data: { code: search.code! } });

      if (res.ok) {
        await router.invalidate();
        toast.success("Email verified. Welcome!");
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      if ("reason" in res && res.reason === "verifier_missing") {
        setStatus("confirmed_no_session");
      } else {
        setStatus("failed");
        setError("This link is invalid or has expired. Request a new one below.");
      }
      navigate({ to: "/verify-email", search: { email: email || undefined }, replace: true });
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken]);

  const resend = async () => {
    setError(null);
    if (!email) return setError("Enter your email first");
    setResending(true);
    try {
      const res = await resendVerification({ data: { email } });
      if (!res.ok) return setError(res.error);
      setStatus("waiting");
      toast.success("A new verification link has been sent");
    } finally {
      setResending(false);
    }
  };

  if (status === "verifying") {
    return (
      <AuthShell title="Verifying your email…" subtitle="This only takes a moment.">
        <div className="h-1 w-full overflow-hidden rounded bg-muted">
          <div className="h-full w-1/2 animate-pulse bg-primary" />
        </div>
      </AuthShell>
    );
  }

  if (status === "confirmed_no_session") {
    return (
      <AuthShell title="Email confirmed" subtitle="Your account is ready.">
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg border bg-secondary/40 p-4 text-sm">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <p>
              Your email address has been verified. Because this link was opened in a different
              browser or app from the one you signed up in, we couldn't sign you in automatically.
              Sign in with your email and password to continue.
            </p>
          </div>
          <Button className="w-full" onClick={() => navigate({ to: "/login" })}>
            Sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={status === "failed" ? "Verification failed" : "Check your inbox"}
      subtitle={
        status === "failed"
          ? undefined
          : "We sent a confirmation link to your email. Click it to activate your workspace."
      }
      footer={
        <Link to="/login" className="text-primary font-medium">
          Back to sign in
        </Link>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border bg-secondary/40 p-4 text-sm">
          {status === "failed" ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          ) : (
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          )}
          <div>
            {status === "failed" ? (
              <p>{error}</p>
            ) : (
              <>
                {email ? (
                  <p>
                    Link sent to <b>{email}</b>.
                  </p>
                ) : null}
                <p className="mt-1 text-muted-foreground">
                  Didn't get it? Check your spam folder, or resend below.
                </p>
              </>
            )}
          </div>
        </div>

        {!search.email && (
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        )}
        {status !== "failed" && error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="button"
          variant={status === "failed" ? "default" : "outline"}
          className="w-full"
          onClick={resend}
          disabled={resending}
        >
          {resending ? "Sending…" : "Resend verification link"}
        </Button>
      </div>
    </AuthShell>
  );
}
