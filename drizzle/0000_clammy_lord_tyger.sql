CREATE SCHEMA IF NOT EXISTS extensions;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;--> statement-breakpoint
CREATE TYPE "public"."fairness_mode" AS ENUM('balanced', 'fairest', 'fastest', 'weighted');--> statement-breakpoint
CREATE TYPE "public"."group_member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."hangout_status" AS ENUM('draft', 'voting', 'decided', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."travel_mode" AS ENUM('two_wheeler', 'drive', 'walk', 'transit');--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "group_member_role" DEFAULT 'member' NOT NULL,
	"weight_override" numeric(3, 2),
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_weight_override_range" CHECK ("group_members"."weight_override" is null or "group_members"."weight_override" between 0.60 and 1.40)
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"invite_code_hash" varchar(64) NOT NULL,
	"invite_expires_at" timestamp with time zone NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_name_not_blank" CHECK (length(trim("groups"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "hangouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"activity_type" varchar(50) NOT NULL,
	"planned_at" timestamp with time zone NOT NULL,
	"fairness_mode" "fairness_mode" DEFAULT 'balanced' NOT NULL,
	"budget_max" integer,
	"time_cap_seconds" integer DEFAULT 1800 NOT NULL,
	"status" "hangout_status" DEFAULT 'draft' NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hangouts_activity_not_blank" CHECK (length(trim("hangouts"."activity_type")) > 0),
	CONSTRAINT "hangouts_budget_non_negative" CHECK ("hangouts"."budget_max" is null or "hangouts"."budget_max" >= 0),
	CONSTRAINT "hangouts_time_cap_range" CHECK ("hangouts"."time_cap_seconds" between 300 and 14400)
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hangout_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"origin" extensions.geography(Point,4326) NOT NULL,
	"travel_mode" "travel_mode" DEFAULT 'two_wheeler' NOT NULL,
	"weight" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"is_flexible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_display_name_not_blank" CHECK (length(trim("participants"."display_name")) > 0),
	CONSTRAINT "participants_weight_range" CHECK ("participants"."weight" between 0.60 and 1.40)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"avatar_url" text,
	"default_travel_mode" "travel_mode" DEFAULT 'two_wheeler' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_display_name_not_blank" CHECK (length(trim("profiles"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "saved_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" varchar(80) NOT NULL,
	"geog" extensions.geography(Point,4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_locations_label_not_blank" CHECK (length(trim("saved_locations"."label")) > 0)
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hangouts" ADD CONSTRAINT "hangouts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hangouts" ADD CONSTRAINT "hangouts_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_hangout_id_hangouts_id_fk" FOREIGN KEY ("hangout_id") REFERENCES "public"."hangouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_locations" ADD CONSTRAINT "saved_locations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_group_user_uidx" ON "group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_invite_code_hash_uidx" ON "groups" USING btree ("invite_code_hash");--> statement-breakpoint
CREATE INDEX "groups_created_by_idx" ON "groups" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "hangouts_creator_idempotency_uidx" ON "hangouts" USING btree ("created_by","idempotency_key");--> statement-breakpoint
CREATE INDEX "hangouts_group_idx" ON "hangouts" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_hangout_user_uidx" ON "participants" USING btree ("hangout_id","user_id");--> statement-breakpoint
CREATE INDEX "participants_origin_gist_idx" ON "participants" USING gist ("origin");--> statement-breakpoint
CREATE INDEX "saved_locations_user_idx" ON "saved_locations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_locations_geog_gist_idx" ON "saved_locations" USING gist ("geog");--> statement-breakpoint

-- Supabase Auth owns auth.users. Keeping this FK in SQL avoids asking
-- drizzle-kit to manage the auth schema while preserving referential integrity.
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_auth_users_id_fk"
  FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade;--> statement-breakpoint

-- Public-schema tables are exposed by Supabase Data API. RLS with no policies
-- is intentionally default-deny; API access goes through Nest in Phase 1.
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hangouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER groups_set_updated_at BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER saved_locations_set_updated_at BEFORE UPDATE ON public.saved_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER hangouts_set_updated_at BEFORE UPDATE ON public.hangouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER participants_set_updated_at BEFORE UPDATE ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint

-- Anonymous sign-ins are real Supabase users too. Every auth identity gets a
-- matching profile so participant.user_id never needs to become nullable.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_name text;
BEGIN
  requested_name := nullif(trim(NEW.raw_user_meta_data ->> 'display_name'), '');

  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    left(
      coalesce(
        requested_name,
        CASE WHEN NEW.is_anonymous THEN 'Guest' END,
        nullif(split_part(NEW.email, '@', 1), ''),
        'Member'
      ),
      100
    )
  );

  RETURN NEW;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
