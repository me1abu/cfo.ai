CREATE TABLE "ai_usage" (
	"org_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_org_id_day_kind_pk" PRIMARY KEY("org_id","day","kind")
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;