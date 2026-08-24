CREATE TABLE "fairness_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"outing_id" uuid NOT NULL,
	"actual_duration_seconds" integer NOT NULL,
	"delta_seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fairness_ledger_actual_duration_range" CHECK ("fairness_ledger"."actual_duration_seconds" between 0 and 86400),
	CONSTRAINT "fairness_ledger_delta_range" CHECK ("fairness_ledger"."delta_seconds" between -86400 and 86400)
);
--> statement-breakpoint
ALTER TABLE "fairness_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hangout_id" uuid NOT NULL,
	"chosen_suggestion_id" uuid,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"happened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fairness_ledger" ADD CONSTRAINT "fairness_ledger_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fairness_ledger" ADD CONSTRAINT "fairness_ledger_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fairness_ledger" ADD CONSTRAINT "fairness_ledger_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outings" ADD CONSTRAINT "outings_hangout_id_hangouts_id_fk" FOREIGN KEY ("hangout_id") REFERENCES "public"."hangouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outings" ADD CONSTRAINT "outings_chosen_suggestion_id_suggestions_id_fk" FOREIGN KEY ("chosen_suggestion_id") REFERENCES "public"."suggestions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outings" ADD CONSTRAINT "outings_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fairness_ledger_outing_user_uidx" ON "fairness_ledger" USING btree ("outing_id","user_id");--> statement-breakpoint
CREATE INDEX "fairness_ledger_group_user_idx" ON "fairness_ledger" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outings_hangout_uidx" ON "outings" USING btree ("hangout_id");--> statement-breakpoint
CREATE INDEX "outings_chosen_suggestion_idx" ON "outings" USING btree ("chosen_suggestion_id");
--> statement-breakpoint

CREATE TRIGGER outings_set_updated_at BEFORE UPDATE ON public.outings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint

-- Phase 6 is API-only. RLS remains default-deny and client roles receive no
-- direct table privileges; the Nest database role performs all writes.
REVOKE ALL ON public.outings, public.fairness_ledger FROM anon, authenticated;
