import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { companyQuery } from "@/lib/queries";
import { updateCompany } from "@/server/company";
import { Building2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/company")({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(companyQuery()),
  head: () => ({
    meta: [
      { title: "Company Profile · AI Invoice Saudi" },
      { name: "description", content: "Manage your company details that appear on every invoice." },
    ],
  }),
  component: CompanyPage,
});

function CompanyPage() {
  const { data: company } = useSuspenseQuery(companyQuery());
  const queryClient = useQueryClient();
  const [form, setForm] = useState(company);

  const save = useMutation({
    mutationFn: () => updateCompany({ data: form }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(companyQuery().queryKey, saved);
      toast.success("Company profile saved — invoices will use these details");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company profile"
        subtitle="These details appear on every invoice you generate."
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-1 h-4 w-4" /> {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="shadow-soft lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Company logo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid h-40 w-full place-items-center rounded-xl border-2 border-dashed">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Logo" className="max-h-32" />
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  <Building2 className="mx-auto h-8 w-8" />
                  <div className="mt-2">No logo uploaded</div>
                </div>
              )}
            </div>
            <Input
              placeholder="Paste image URL"
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
            />
          </CardContent>
        </Card>

        <Card className="shadow-soft lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Business details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Company name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>VAT number</Label>
              <Input
                value={form.vatNumber}
                onChange={(e) => setForm({ ...form, vatNumber: e.target.value })}
                placeholder="15 digits, starts and ends with 3"
              />
            </div>
            <div className="space-y-1.5">
              <Label>CR number</Label>
              <Input
                value={form.crNumber}
                onChange={(e) => setForm({ ...form, crNumber: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Website</Label>
              <Input
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Bank information</Label>
              <Textarea
                value={form.bank}
                onChange={(e) => setForm({ ...form, bank: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Default currency</Label>
              <Input
                value={form.currency}
                maxLength={3}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Default VAT rate (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.vatRate}
                onChange={(e) => setForm({ ...form, vatRate: +e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Invoice footer</Label>
              <Textarea
                value={form.footer}
                onChange={(e) => setForm({ ...form, footer: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
