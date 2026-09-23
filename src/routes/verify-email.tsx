import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { AuthShell } from "@/components/AuthShell";
import { toast } from "sonner";

export const Route = createFileRoute("/verify-email")({
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
  const [code, setCode] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return toast.error("Enter the 6-digit code");
    toast.success("Email verified");
    navigate({ to: "/dashboard" });
  };
  return (
    <AuthShell
      title="Verify your email"
      subtitle="We sent a 6-digit code to your inbox"
      footer={
        <Link to="/login" className="text-primary font-medium">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-6">
        <InputOTP maxLength={6} value={code} onChange={setCode}>
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            Verify
          </Button>
          <Button type="button" variant="outline" onClick={() => toast("Code resent")}>
            Resend
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
