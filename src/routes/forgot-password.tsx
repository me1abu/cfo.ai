import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/AuthShell";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot password · AI Invoice Saudi" },
      { name: "description", content: "Reset your password." },
    ],
  }),
  component: Page,
});

function Page() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    toast.success("Reset link sent");
  };
  return (
    <AuthShell
      title="Forgot password?"
      subtitle="Enter your email and we'll send a reset link"
      footer={
        <>
          <Link to="/login" className="text-primary font-medium">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="rounded-lg border bg-secondary/40 p-4 text-sm">
          A reset link has been sent to <b>{email}</b>. It expires in 1 hour.
          <div className="mt-3">
            <Link to="/reset-password" className="text-primary font-medium">
              Open reset page (demo)
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
