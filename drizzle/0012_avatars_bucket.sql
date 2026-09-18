-- Ảnh đại diện: client upload thẳng lên Supabase Storage bằng phiên của chính họ,
-- rồi PATCH /v1/profiles/me với URL — API validate tiền tố, không bao giờ chạm bytes.
-- Ký signed upload URL từ API sẽ đưa service-role key lên đường đi của người dùng,
-- còn proxy bytes qua Nest thì đụng giới hạn body của Vercel và gấp đôi băng thông.
--
-- Schema `storage` do Supabase sở hữu nên drizzle-kit không quản; file này viết tay
-- và không có snapshot, theo đúng tiền lệ của migration 0008.
--
-- LƯU Ý KHI CHẠY: một số project Supabase chỉ cho `supabase_storage_admin` tạo policy
-- trên storage.objects. Nếu migration báo quyền, tạo bucket và ba policy qua dashboard
-- (Storage → Policies) và giữ file này làm tài liệu về những gì đã được cấu hình.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;--> statement-breakpoint

-- Bucket public nên không cần policy SELECT; ai cũng đọc được ảnh đại diện.
-- Ghi thì mỗi người chỉ được đụng vào thư mục mang chính user id của mình —
-- cùng một điều kiện mà ProfileService kiểm tra lại trên URL gửi lên.
drop policy if exists "avatars_owner_insert" on storage.objects;--> statement-breakpoint
create policy "avatars_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );--> statement-breakpoint

drop policy if exists "avatars_owner_update" on storage.objects;--> statement-breakpoint
create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );--> statement-breakpoint

drop policy if exists "avatars_owner_delete" on storage.objects;--> statement-breakpoint
create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
