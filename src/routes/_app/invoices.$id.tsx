import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { InvoiceEditor } from "./invoices.new";
import { companyQuery, customersQuery, invoiceQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/invoices/$id")({
  loader: async ({ context: { queryClient }, params }) => {
    const [invoice] = await Promise.all([
      queryClient.ensureQueryData(invoiceQuery(params.id)),
      queryClient.ensureQueryData(companyQuery()),
      queryClient.ensureQueryData(customersQuery()),
    ]);
    if (!invoice) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Invoice · AI Invoice Saudi" },
      { name: "description", content: "Edit an invoice." },
    ],
  }),
  component: EditInvoice,
});

function EditInvoice() {
  const { id } = Route.useParams();
  const { data: invoice } = useSuspenseQuery(invoiceQuery(id));
  if (!invoice) throw notFound();
  return <InvoiceEditor key={invoice.id} mode="edit" initial={invoice} />;
}
