ALTER TABLE "saved_locations" ADD COLUMN "address" varchar(512);--> statement-breakpoint
CREATE UNIQUE INDEX "saved_locations_user_label_uidx" ON "saved_locations" USING btree ("user_id","label");--> statement-breakpoint
ALTER TABLE "saved_locations" ADD CONSTRAINT "saved_locations_address_not_blank" CHECK ("saved_locations"."address" is null or length(trim("saved_locations"."address")) > 0);--> statement-breakpoint
-- Bảng này chỉ API đọc/ghi: RLS mặc định từ chối và Nest kết nối bằng role bỏ qua RLS.
-- REVOKE cho khớp tư thế của migration 0003 — không có subscriber Realtime nào ở đây.
REVOKE ALL ON public.saved_locations FROM anon, authenticated;
