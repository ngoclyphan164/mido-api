CREATE TYPE "public"."vote_value" AS ENUM('up', 'down', 'veto');--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hangout_id" uuid NOT NULL,
	"place_ref_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suggestions_rank_range" CHECK ("suggestions"."rank" between 1 and 10)
);
--> statement-breakpoint
ALTER TABLE "suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"value" "vote_value" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_hangout_id_hangouts_id_fk" FOREIGN KEY ("hangout_id") REFERENCES "public"."hangouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_place_ref_id_provider_place_refs_id_fk" FOREIGN KEY ("place_ref_id") REFERENCES "public"."provider_place_refs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_suggestion_id_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "suggestions_hangout_place_uidx" ON "suggestions" USING btree ("hangout_id","place_ref_id");--> statement-breakpoint
CREATE INDEX "suggestions_hangout_active_idx" ON "suggestions" USING btree ("hangout_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_suggestion_participant_uidx" ON "votes" USING btree ("suggestion_id","participant_id");--> statement-breakpoint
CREATE INDEX "votes_suggestion_idx" ON "votes" USING btree ("suggestion_id");
--> statement-breakpoint

CREATE TRIGGER suggestions_set_updated_at BEFORE UPDATE ON public.suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER votes_set_updated_at BEFORE UPDATE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint

-- Security-definer helper avoids recursive RLS checks through hangouts /
-- group_members while still binding access to the current Supabase auth user.
CREATE OR REPLACE FUNCTION public.can_access_hangout(target_hangout_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hangouts h
    JOIN public.group_members gm ON gm.group_id = h.group_id
    WHERE h.id = target_hangout_id
      AND gm.user_id = (SELECT auth.uid())
  );
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.can_access_suggestion(target_suggestion_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.suggestions s
    JOIN public.hangouts h ON h.id = s.hangout_id
    JOIN public.group_members gm ON gm.group_id = h.group_id
    WHERE s.id = target_suggestion_id
      AND gm.user_id = (SELECT auth.uid())
  );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.can_access_hangout(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.can_access_suggestion(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.can_access_hangout(uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.can_access_suggestion(uuid) TO authenticated;--> statement-breakpoint

CREATE POLICY suggestions_group_member_select ON public.suggestions
  FOR SELECT TO authenticated
  USING (public.can_access_hangout(hangout_id));--> statement-breakpoint
CREATE POLICY votes_group_member_select ON public.votes
  FOR SELECT TO authenticated
  USING (public.can_access_suggestion(suggestion_id));--> statement-breakpoint
CREATE POLICY provider_place_refs_group_member_select ON public.provider_place_refs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.suggestions s
      WHERE s.place_ref_id = provider_place_refs.id
        AND public.can_access_hangout(s.hangout_id)
    )
  );--> statement-breakpoint

REVOKE ALL ON public.suggestions, public.votes, public.provider_place_refs FROM anon;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON public.suggestions, public.votes, public.provider_place_refs
  FROM authenticated;--> statement-breakpoint
GRANT SELECT ON public.suggestions, public.votes, public.provider_place_refs TO authenticated;--> statement-breakpoint
GRANT USAGE ON TYPE public.vote_value TO authenticated;--> statement-breakpoint

ALTER TABLE public.suggestions REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE public.votes REPLICA IDENTITY FULL;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'suggestions'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.suggestions';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'votes'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.votes';
    END IF;
  END IF;
END;
$$;
