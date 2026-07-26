import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { InvoiceEditor } from "./invoices_.new";

export const Route = createFileRoute("/_app/invoices_/$id")({
  head: () => ({ meta: [{ title: "Invoice · AI Invoice Saudi" }, { name: "description", content: "Edit an invoice." }] }),
  component: EditInvoice,
});

function EditInvoice() {
  const { id } = useParams({ from: "/_app/invoices_/$id" });
  return <InvoiceEditor mode="edit" id={id} />;
}
