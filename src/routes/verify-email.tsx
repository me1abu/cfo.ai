import { createFileRoute, useNavigate, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { AuthShell } from "@/components/AuthShell";
import { resendVerification, verifyEmailOtp } from "@/server/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/verify-email")({
  validateSearch: z.object({ email: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Verify email · AI Invoice Saudi" },
      { name: "description", content: "Verify your email." },
    ],
  }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const router = useRouter();
  const search = Route.useSearch();
  const [email, setEmail] = useState(search.email ?? "");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (code.length !== 6) return setError("Enter the 6-digit code");
    setLoading(true);
    try {
      const res = await verifyEmailOtp({ data: { email, token: code } });
      if (!res.ok) return setError(res.error);
      await router.invalidate();
      toast.success("Email verified");
      navigate({ to: "/dashboard" });
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!email) return setError("Enter your email first");
    const res = await resendVerification({ data: { email } });
    if (!res.ok) return setError(res.error);
    toast.success("A new code has been sent");
  };

  return (
    <AuthShell
      title="Verify your email"
      subtitle="Enter the 6-digit code we emailed you. The email also contains a link you can click instead."
      footer={
        <Link to="/login" className="text-primary font-medium">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-6">
        {!search.email && (
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        )}
        <InputOTP maxLength={6} value={code} onChange={setCode}>
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={loading}>
            {loading ? "Verifying…" : "Verify"}
          </Button>
          <Button type="button" variant="outline" onClick={resend}>
            Resend
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
