import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/AuthShell";
import { exchangeAuthCode, updatePassword, verifyTokenHash } from "@/server/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({
    code: z.string().optional(),
    token_hash: z.string().optional(),
    type: z.enum(["recovery", "email"]).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Reset password · AI Invoice Saudi" },
      { name: "description", content: "Set a new password." },
    ],
  }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const { code, token_hash, type } = Route.useSearch();
  const hasToken = Boolean(code || token_hash);
  const [ready, setReady] = useState(!hasToken);
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Single-use token: guard against StrictMode's double effect run in development.
  const started = useRef(false);

  // The email link lands here with a token; turn it into a session before allowing the update.
  useEffect(() => {
    if (!hasToken || started.current) return;
    started.current = true;
    const run = async () => {
      const res = token_hash
        ? await verifyTokenHash({ data: { tokenHash: token_hash, type: type ?? "recovery" } })
        : await exchangeAuthCode({ data: { code: code! } });
      if (!res.ok) {
        setErr(
          "reason" in res && res.reason === "verifier_missing"
            ? "This reset link was opened in a different browser from the one that requested it. Request a new link and it will work from any browser."
            : "This reset link is invalid or has expired. Request a new one.",
        );
      }
      setReady(true);
      navigate({ to: "/reset-password", search: {}, replace: true });
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (p.length < 8) return setErr("Password must be at least 8 characters");
    if (p !== c) return setErr("Passwords do not match");
    setLoading(true);
    try {
      const res = await updatePassword({ data: { password: p } });
      if (!res.ok) return setErr(res.error);
      toast.success("Password updated. Please sign in.");
      navigate({ to: "/login" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Set a new password"
      footer={
        <Link to="/login" className="text-primary font-medium">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new">New password</Label>
          <Input
            id="new"
            type="password"
            autoComplete="new-password"
            required
            value={p}
            onChange={(e) => setP(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={c}
            onChange={(e) => setC(e.target.value)}
          />
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button type="submit" className="w-full" disabled={loading || !ready}>
          {loading ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
