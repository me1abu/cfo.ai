CREATE TYPE "public"."document_type" AS ENUM('invoice', 'credit_note');--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "document_type" "document_type" DEFAULT 'invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "original_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_original_invoice_id_invoices_id_fk" FOREIGN KEY ("original_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_original_idx" ON "invoices" USING btree ("original_invoice_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "credit_note_has_original" CHECK ("invoices"."document_type" <> 'credit_note' OR "invoices"."original_invoice_id" IS NOT NULL);