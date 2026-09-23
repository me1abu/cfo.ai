import { createFileRoute, useParams } from "@tanstack/react-router";
import { InvoiceEditor } from "./invoices.new";

export const Route = createFileRoute("/_app/invoices/$id")({
  head: () => ({
    meta: [
      { title: "Invoice · AI Invoice Saudi" },
      { name: "description", content: "Edit an invoice." },
    ],
  }),
  component: EditInvoice,
});

function EditInvoice() {
  const { id } = useParams({ from: "/_app/invoices/$id" });
  return <InvoiceEditor mode="edit" id={id} />;
}
