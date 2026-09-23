import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore, formatMoney, computeTotals } from "@/lib/store";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { FileDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({
    meta: [
      { title: "Reports · AI Invoice Saudi" },
      { name: "description", content: "Financial and VAT reports." },
    ],
  }),
  component: Reports,
});

function Reports() {
  const invoices = useStore((s) => s.invoices);

  const monthlyRevenue = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"].map((m, i) => ({
    month: m,
    revenue: [42000, 51000, 47500, 63000, 88000, 72500][i],
    vat: [6300, 7650, 7125, 9450, 13200, 10875][i],
  }));

  const byCustomer = invoices.reduce<Record<string, number>>((acc, inv) => {
    const t = computeTotals(inv.items).total;
    acc[inv.customerName] = (acc[inv.customerName] ?? 0) + t;
    return acc;
  }, {});
  const customerRows = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]);

  const exportAs = (format: string) => toast.success(`${format.toUpperCase()} exported (demo)`);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Financial insights and VAT breakdowns"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportAs("pdf")}>
              <FileDown className="mr-1 h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" onClick={() => exportAs("excel")}>
              <FileDown className="mr-1 h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" onClick={() => exportAs("csv")}>
              <FileDown className="mr-1 h-4 w-4" /> CSV
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="vat">VAT summary</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="customers">Customer activity</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-4">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">Monthly revenue (SAR)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer>
                  <BarChart data={monthlyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="revenue" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vat" className="mt-4">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">VAT collected — monthly</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer>
                  <BarChart data={monthlyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="vat" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <Card className="shadow-soft">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Number</th>
                    <th className="p-3 text-left">Customer</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => {
                    const t = computeTotals(i.items);
                    return (
                      <tr key={i.id} className="border-t">
                        <td className="p-3 font-medium">{i.number}</td>
                        <td className="p-3">{i.customerName}</td>
                        <td className="p-3 text-center capitalize">{i.status}</td>
                        <td className="p-3 text-right">{formatMoney(t.total, i.currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers" className="mt-4">
          <Card className="shadow-soft">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Customer</th>
                    <th className="p-3 text-right">Total billed</th>
                  </tr>
                </thead>
                <tbody>
                  {customerRows.map(([name, total]) => (
                    <tr key={name} className="border-t">
                      <td className="p-3 font-medium">{name}</td>
                      <td className="p-3 text-right">{formatMoney(total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
