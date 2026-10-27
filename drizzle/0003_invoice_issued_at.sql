ALTER TABLE "invoices" ADD COLUMN "issued_at" timestamp with time zone;--> statement-breakpoint
-- Backfill: invoices already finalized before this column existed use their creation time.
UPDATE "invoices" SET "issued_at" = "created_at" WHERE "status" <> 'draft' AND "issued_at" IS NULL;
