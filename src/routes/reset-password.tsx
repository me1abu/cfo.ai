import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/AuthShell";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
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
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (p.length < 6) return setErr("Password must be at least 6 characters");
    if (p !== c) return setErr("Passwords do not match");
    toast.success("Password updated");
    navigate({ to: "/login" });
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
          <Label>New password</Label>
          <Input type="password" required value={p} onChange={(e) => setP(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Confirm password</Label>
          <Input type="password" required value={c} onChange={(e) => setC(e.target.value)} />
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button type="submit" className="w-full">
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
