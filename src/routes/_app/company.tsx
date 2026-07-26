import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore, updateCompany } from "@/lib/store";
import { Building2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/company")({
  head: () => ({ meta: [{ title: "Company Profile · AI Invoice Saudi" }, { name: "description", content: "Manage your company details that appear on every invoice." }] }),
  component: CompanyPage,
});

function CompanyPage() {
  const company = useStore((s) => s.company);
  const [form, setForm] = useState(company);

  const save = () => { updateCompany(form); toast.success("Company profile saved — invoices will use these details"); };

  return (
    <div className="space-y-6">
      <PageHeader title="Company profile" subtitle="These details appear on every invoice you generate."
        actions={<Button onClick={save}><Save className="mr-1 h-4 w-4" /> Save changes</Button>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="shadow-soft lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Company logo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid h-40 w-full place-items-center rounded-xl border-2 border-dashed">
              {form.logoUrl ? <img src={form.logoUrl} alt="Logo" className="max-h-32" /> : <div className="text-center text-sm text-muted-foreground"><Building2 className="mx-auto h-8 w-8" /><div className="mt-2">No logo uploaded</div></div>}
            </div>
            <Input placeholder="Paste image URL" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
          </CardContent>
        </Card>

        <Card className="shadow-soft lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Business details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Company name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>VAT number</Label><Input value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>CR number</Label><Input value={form.crNumber} onChange={(e) => setForm({ ...form, crNumber: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Bank information</Label><Textarea value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Default currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Default VAT rate (%)</Label><Input type="number" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: +e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Invoice footer</Label><Textarea value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })} /></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
