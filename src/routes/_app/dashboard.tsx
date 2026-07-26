import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStore, formatMoney, computeTotals } from "@/lib/store";
import { FileText, FileClock, CheckCircle2, AlertCircle, TrendingUp, Percent, UploadCloud, Plus, ShieldCheck, QrCode } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · AI Invoice Saudi" }, { name: "description", content: "Overview of your invoices, revenue and VAT." }] }),
  component: Dashboard,
});

const statusColors: Record<string, string> = {
  paid: "bg-success/15 text-success border-success/30",
  unpaid: "bg-warning/15 text-warning-foreground border-warning/40",
  draft: "bg-muted text-muted-foreground border-border",
  overdue: "bg-destructive/15 text-destructive border-destructive/30",
};

function Dashboard() {
  const invoices = useStore((s) => s.invoices);
  const navigate = useNavigate();
  const total = invoices.length;
  const draft = invoices.filter((i) => i.status === "draft").length;
  const paid = invoices.filter((i) => i.status === "paid").length;
  const unpaid = invoices.filter((i) => i.status === "unpaid" || i.status === "overdue").length;
  let revenue = 0, vatTotal = 0;
  invoices.forEach((i) => { const t = computeTotals(i.items); revenue += t.total; vatTotal += t.vat; });

  const monthly = ["Jun","Jul","Aug","Sep","Oct","Nov"].map((m, idx) => ({
    month: m, revenue: [42000, 51000, 47500, 63000, 88000, 72500][idx], vat: [6300, 7650, 7125, 9450, 13200, 10875][idx],
  }));
  const statusData = [
    { name: "Paid", value: paid, color: "var(--success)" },
    { name: "Unpaid", value: invoices.filter(i => i.status === "unpaid").length, color: "var(--warning)" },
    { name: "Overdue", value: invoices.filter(i => i.status === "overdue").length, color: "var(--destructive)" },
    { name: "Draft", value: draft, color: "var(--muted-foreground)" },
  ];

  const stats = [
    { label: "Total Invoices", value: total, icon: FileText, tint: "bg-primary/10 text-primary" },
    { label: "Draft", value: draft, icon: FileClock, tint: "bg-muted-foreground/10 text-muted-foreground" },
    { label: "Paid", value: paid, icon: CheckCircle2, tint: "bg-success/10 text-success" },
    { label: "Unpaid / Overdue", value: unpaid, icon: AlertCircle, tint: "bg-destructive/10 text-destructive" },
    { label: "Total Revenue", value: formatMoney(revenue), icon: TrendingUp, tint: "bg-primary/10 text-primary" },
    { label: "VAT Collected", value: formatMoney(vatTotal), icon: Percent, tint: "bg-accent text-accent-foreground" },
  ];

  const quick = [
    { label: "Upload Document", icon: UploadCloud, to: "/upload" },
    { label: "Create Invoice", icon: Plus, to: "/invoices/new" },
    { label: "Validate Invoice", icon: ShieldCheck, to: "/validation" },
    { label: "Scan QR Code", icon: QrCode, to: "/qr-scanner" },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your invoicing activity"
        actions={<Button onClick={() => navigate({ to: "/invoices/new" })}><Plus className="mr-1 h-4 w-4" /> New invoice</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-soft">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`grid h-10 w-10 place-items-center rounded-xl ${s.tint}`}><s.icon className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <div className="truncate text-xs text-muted-foreground">{s.label}</div>
                  <div className="truncate text-lg font-semibold">{s.value}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {quick.map((q) => (
          <button key={q.label} onClick={() => navigate({ to: q.to })}
            className="group flex items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-soft transition hover:border-primary/30 hover:shadow-md">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors"><q.icon className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-medium">{q.label}</div>
              <div className="text-xs text-muted-foreground">Go →</div>
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-soft">
          <CardHeader><CardTitle className="text-base">Monthly revenue</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={monthly}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} fill="url(#rev)" name="Revenue (SAR)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader><CardTitle className="text-base">Invoice status</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={3}>
                    {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-soft">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Recent activity</CardTitle>
          <Button variant="ghost" asChild><Link to="/invoices">View all</Link></Button>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {invoices.slice(0, 6).map((i) => {
              const t = computeTotals(i.items);
              return (
                <Link key={i.id} to="/invoices/$id" params={{ id: i.id }} className="flex items-center justify-between gap-4 py-3 hover:bg-accent/40 -mx-2 px-2 rounded-md">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">{i.number}</div>
                      <Badge variant="outline" className={statusColors[i.status]}>{i.status}</Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{i.customerName} · Due {i.dueDate}</div>
                  </div>
                  <div className="text-sm font-semibold">{formatMoney(t.total, i.currency)}</div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
