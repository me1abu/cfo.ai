import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useMemo } from "react";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InvoiceEditor } from "./invoices.new";
import { nextInvoiceNumber, todayISO, type Invoice } from "@/lib/invoice-math";
import { companyQuery, customersQuery, invoiceQuery, invoicesQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/credit-notes/new")({
  validateSearch: z.object({ invoice: z.string().uuid() }),
  loaderDeps: ({ search }) => ({ invoice: search.invoice }),
  loader: async ({ context: { queryClient }, deps }) => {
    await Promise.all([
      queryClient.ensureQueryData(invoiceQuery(deps.invoice)),
      queryClient.ensureQueryData(invoicesQuery()),
      queryClient.ensureQueryData(companyQuery()),
      queryClient.ensureQueryData(customersQuery()),
    ]);
  },
  head: () => ({
    meta: [
      { title: "New credit note · AI Invoice Saudi" },
      { name: "description", content: "Issue a credit note against an invoice." },
    ],
  }),
  component: NewCreditNote,
});

let tmp = 0;

function NewCreditNote() {
  const { invoice: originalId } = Route.useSearch();
  const { data: original } = useSuspenseQuery(invoiceQuery(originalId));
  const { data: docs } = useSuspenseQuery(invoicesQuery());

  const initial = useMemo<Invoice | null>(() => {
    if (!original || original.documentType !== "invoice" || !original.issuedAt) return null;
    const today = todayISO();
    return {
      id: "",
      documentType: "credit_note",
      originalInvoiceId: original.id,
      reason: "",
      number: nextInvoiceNumber(docs, new Date().getFullYear(), "credit_note"),
      date: today,
      dueDate: today,
      customerId: original.customerId,
      customerName: original.customerName,
      customerVat: original.customerVat,
      customerAddress: original.customerAddress,
      currency: original.currency,
      // Start from the original lines; reduce quantities or remove lines to credit part of it.
      items: original.items.map((it) => ({ ...it, id: `tmp_cn_${++tmp}` })),
      status: "draft",
      notes: "",
      template: "bilingual",
      issuedAt: null,
    };
    // Built once per original invoice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original?.id]);

  if (!initial) {
    return (
      <div className="space-y-6">
        <PageHeader title="New credit note" />
        <Card className="shadow-soft">
          <CardContent className="space-y-3 p-6 text-sm">
            <p>
              {!original
                ? "That invoice was not found."
                : original.documentType !== "invoice"
                  ? "Credit notes can only amend invoices, not other credit notes."
                  : "Only issued invoices can be credited. A draft can still be edited or deleted."}
            </p>
            <Button variant="outline" asChild>
              <Link to="/invoices">Back to invoices</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <InvoiceEditor key={original!.id} mode="new" initial={initial} />;
}
