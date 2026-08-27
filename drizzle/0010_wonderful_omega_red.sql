ALTER TABLE "fairness_ledger" DROP CONSTRAINT "fairness_ledger_user_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "groups" DROP CONSTRAINT "groups_created_by_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "hangouts" DROP CONSTRAINT "hangouts_created_by_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "outings" DROP CONSTRAINT "outings_decided_by_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "participants" DROP CONSTRAINT "participants_user_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "outings" ALTER COLUMN "decided_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fairness_ledger" ADD CONSTRAINT "fairness_ledger_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hangouts" ADD CONSTRAINT "hangouts_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outings" ADD CONSTRAINT "outings_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;