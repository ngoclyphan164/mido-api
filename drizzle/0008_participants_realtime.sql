-- Group members may receive participant changes directly from Supabase
-- Realtime. Writes remain API-only; this policy grants read access solely to
-- users who can already read the parent hangout through the Nest API.
CREATE POLICY participants_group_member_select ON public.participants
  FOR SELECT TO authenticated
  USING (public.can_access_hangout(hangout_id));--> statement-breakpoint

REVOKE ALL ON public.participants FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT ON public.participants TO authenticated;--> statement-breakpoint

-- FULL is required so UPDATE events contain the complete previous row and is
-- consistent with the other realtime tables in this schema.
ALTER TABLE public.participants REPLICA IDENTITY FULL;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'participants'
    )
  THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.participants';
  END IF;
END;
$$;
