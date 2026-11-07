import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { companyQuery, zatcaQuery } from "@/lib/queries";
import { companyBlockers } from "@/lib/zatca-phase2";
import { connectZatca } from "@/server/zatca";

export const Route = createFileRoute("/_app/zatca")({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(zatcaQuery()),
      queryClient.ensureQueryData(companyQuery()),
    ]),
  head: () => ({
    meta: [
      { title: "ZATCA Connection · AI Invoice Saudi" },
      { name: "description", content: "Connect your company to ZATCA's FATOORA platform." },
    ],
  }),
  component: ZatcaPage,
});

const ENVIRONMENT_NAMES = {
  "developer-portal": "Testing (developer sandbox)",
  simulation: "Simulation",
  core: "Live",
};

function ZatcaPage() {
  const { data: connection } = useSuspenseQuery(zatcaQuery());
  const { data: company } = useSuspenseQuery(companyQuery());
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ otp: "", branch: "", industry: "" });
  const blockers = companyBlockers(company);

  const connect = useMutation({
    mutationFn: () => connectZatca({ data: form }),
    onSuccess: async (res) => {
      if (!res.ok) return toast.error(res.error);
      await queryClient.invalidateQueries({ queryKey: ["zatca"] });
      toast.success("Connected to ZATCA");
    },
    onError: () => toast.error("Check the form and try again"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="ZATCA Connection"
        subtitle="Send invoices to ZATCA's FATOORA platform (Phase 2)."
      />

      {connection ? (
        <Card className="shadow-soft" data-testid="zatca-connected">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-success" /> Connected
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Environment: {ENVIRONMENT_NAMES[connection.environment]}</p>
            <p>Unit: {connection.commonName}</p>
            <p>Documents sent: {connection.documentsSent}</p>
            <p>
              Certificate expires:{" "}
              {new Date(connection.certificateExpiresAt).toLocaleDateString("en-GB")}
            </p>
            <p className="pt-2 text-muted-foreground">
              Invoices you issue now go to ZATCA automatically: standard invoices are cleared before
              you can share them, and simplified invoices are reported.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Connect to ZATCA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Log in to the FATOORA portal with your ZATCA account.</li>
              <li>Choose Onboard New Solution Unit/Device and generate an OTP.</li>
              <li>Enter the OTP below within 1 hour.</li>
            </ol>
            {blockers.length > 0 && (
              <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                First add {blockers.join("; ")} on your{" "}
                <Link to="/company" className="font-medium text-primary">
                  company profile
                </Link>
                .
              </p>
            )}
            <form
              className="grid max-w-md gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                connect.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="zatca-otp">OTP from FATOORA</Label>
                <Input
                  id="zatca-otp"
                  inputMode="numeric"
                  required
                  value={form.otp}
                  onChange={(e) => setForm({ ...form, otp: e.target.value })}
                  data-testid="zatca-otp"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zatca-branch">Branch name</Label>
                <Input
                  id="zatca-branch"
                  required
                  placeholder="Main branch"
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  data-testid="zatca-branch"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zatca-industry">Business activity</Label>
                <Input
                  id="zatca-industry"
                  required
                  placeholder="Consulting"
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  data-testid="zatca-industry"
                />
              </div>
              <div>
                <Button
                  type="submit"
                  disabled={connect.isPending || blockers.length > 0}
                  data-testid="zatca-connect"
                >
                  {connect.isPending ? "Connecting… this takes up to a minute" : "Connect"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
