-- Bỏ vote up/down/veto: từ giờ mỗi thành viên tick đúng một quán cho mỗi kèo.
--
-- Không migrate dữ liệu cũ. Một người có thể đã up nhiều quán, nên không có
-- cách nào không tuỳ tiện để chọn ra đâu là lựa chọn duy nhất của họ; và bảng
-- `votes` chỉ mới có dữ liệu thử trên TestFlight.
--
-- DROP TABLE gỡ luôn policy, trigger và entry trong publication
-- supabase_realtime của `votes`. Tất cả được dựng lại cho `picks` ở dưới —
-- thiếu một cái là client mất realtime hoặc mất quyền SELECT.
DROP TABLE IF EXISTS "votes";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."vote_value";--> statement-breakpoint

CREATE TABLE "picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "picks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_suggestion_id_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Luật "một người một quán" nằm ở đây, không ở tầng code: participant vốn đã
-- thuộc đúng một kèo, nên unique trên participant_id là đúng một lựa chọn cho
-- mỗi người trong mỗi kèo. Đổi ý là UPDATE hàng cũ.
CREATE UNIQUE INDEX "picks_participant_uidx" ON "picks" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "picks_suggestion_idx" ON "picks" USING btree ("suggestion_id");--> statement-breakpoint

CREATE TRIGGER picks_set_updated_at BEFORE UPDATE ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint

-- Cùng helper security-definer mà `votes` từng dùng, nên không phát sinh vòng
-- lặp RLS qua hangouts / group_members.
CREATE POLICY picks_group_member_select ON public.picks
  FOR SELECT TO authenticated
  USING (public.can_access_suggestion(suggestion_id));--> statement-breakpoint

REVOKE ALL ON public.picks FROM anon;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON public.picks FROM authenticated;--> statement-breakpoint
GRANT SELECT ON public.picks TO authenticated;--> statement-breakpoint

ALTER TABLE public.picks REPLICA IDENTITY FULL;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'picks'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.picks';
    END IF;
  END IF;
END;
$$;
