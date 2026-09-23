import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney, computeTotals, monthlySeries } from "@/lib/invoice-math";
import { invoicesQuery } from "@/lib/queries";
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
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(invoicesQuery()),
  head: () => ({
    meta: [
      { title: "Reports · AI Invoice Saudi" },
      { name: "description", content: "Financial and VAT reports." },
    ],
  }),
  component: Reports,
});

function Reports() {
  const { data: invoices } = useSuspenseQuery(invoicesQuery());
  const monthlyRevenue = monthlySeries(invoices);

  const byCustomer = invoices.reduce<Record<string, number>>((acc, inv) => {
    if (inv.status === "draft") return acc;
    const t = computeTotals(inv.items).total;
    acc[inv.customerName] = (acc[inv.customerName] ?? 0) + t;
    return acc;
  }, {});
  const customerRows = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]);

  const exportCsv = () => {
    const header = [
      "Number",
      "Customer",
      "Date",
      "Due",
      "Status",
      "Currency",
      "Subtotal",
      "VAT",
      "Total",
    ];
    const lines = invoices.map((i) => {
      const t = computeTotals(i.items);
      return [
        i.number,
        i.customerName,
        i.date,
        i.dueDate,
        i.status,
        i.currency,
        t.subtotal,
        t.vat,
        t.total,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Financial insights and VAT breakdowns"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => toast.info("PDF export arrives in Phase 2")}>
              <FileDown className="mr-1 h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" onClick={() => toast.info("Excel export arrives in Phase 4")}>
              <FileDown className="mr-1 h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" onClick={exportCsv}>
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
              <CardTitle className="text-base">Monthly revenue (SAR, last 6 months)</CardTitle>
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
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted-foreground">
                        No invoices yet.
                      </td>
                    </tr>
                  )}
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
                  {customerRows.length === 0 && (
                    <tr>
                      <td colSpan={2} className="p-8 text-center text-muted-foreground">
                        No billed invoices yet.
                      </td>
                    </tr>
                  )}
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
