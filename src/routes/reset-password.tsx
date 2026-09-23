import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/AuthShell";
import { exchangeAuthCode, updatePassword } from "@/server/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ code: z.string().optional() }),
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
  const { code } = Route.useSearch();
  const [ready, setReady] = useState(!code);
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The email link lands here with ?code=…; exchange it for a session before allowing the update.
  useEffect(() => {
    if (!code) return;
    exchangeAuthCode({ data: { code } }).then((res) => {
      if (!res.ok) setErr("This reset link is invalid or has expired. Request a new one.");
      setReady(true);
      navigate({ to: "/reset-password", search: {}, replace: true });
    });
  }, [code, navigate]);

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
