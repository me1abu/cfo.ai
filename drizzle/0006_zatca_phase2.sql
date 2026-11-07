CREATE TABLE "zatca_documents" (
	"invoice_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"uuid" uuid NOT NULL,
	"counter" integer NOT NULL,
	"hash" text NOT NULL,
	"qr" text NOT NULL,
	"status" text NOT NULL,
	"signed_xml" text NOT NULL,
	"cleared_xml" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zatca_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "zatca_units" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"common_name" text NOT NULL,
	"serial" text NOT NULL,
	"private_key" text NOT NULL,
	"token" text NOT NULL,
	"secret" text NOT NULL,
	"certificate_expires_at" timestamp with time zone NOT NULL,
	"last_counter" integer DEFAULT 0 NOT NULL,
	"last_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zatca_units" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "national_address" jsonb;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "customer_national_address" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "national_address" jsonb;--> statement-breakpoint
ALTER TABLE "zatca_documents" ADD CONSTRAINT "zatca_documents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zatca_documents" ADD CONSTRAINT "zatca_documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zatca_units" ADD CONSTRAINT "zatca_units_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "zatca_documents_org_idx" ON "zatca_documents" USING btree ("org_id");