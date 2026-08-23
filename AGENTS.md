# mido-api

NestJS 11 (stable) — KHÔNG phải v12. v12 mới chỉ có alpha trên tag `next`.

Quy tắc bắt buộc khi viết code trong repo này:

1. **Import tương đối, không dùng path alias `@/*`.** `nest build`/`tsc` không rewrite paths →
   app chết trên Vercel.
2. **Validation bằng Zod + `nestjs-zod`**, không dùng class-validator/class-transformer.
   Đây là bước chuẩn bị cho Standard Schema của v12.
3. **Test bằng Vitest**, không dùng Jest.
4. **`src/main.ts` là entrypoint Vercel** — không đổi tên, không đổi vị trí, không thêm
   `api/index.ts`.
5. Không dùng `@nestjs/websockets` / `@nestjs/schedule` — Vercel Functions không giữ kết nối
   dài. Realtime đi qua Supabase Realtime, cron đi qua Vercel Cron gọi route `/v1/cron/*`.
6. **`vercel.json` chỉ chứa `crons`.** Không thêm block `functions` (kể cả để set
   `maxDuration`) — nó chỉ khớp file trong `api/`, thêm vào là deploy fail ngay.
   Max duration đổi trong dashboard, mặc định đã là 300s.
7. Logic tính toán (`src/midpoint/`) phải là hàm thuần, không phụ thuộc Nest DI, và phải có test.
8. Không gọi Google Places/Routes API thật trong test — dùng fixture đã record.

Đọc `README.md` để biết bối cảnh và roadmap.
