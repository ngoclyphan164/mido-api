# mido-api

Backend cho **mido** — app tìm điểm hẹn "ở giữa" cho nhóm bạn đi ăn, cà phê, nhậu, xem phim.
Mục tiêu: chọn chỗ dựa trên **thời gian di chuyển thực tế của từng người**, và show ra bảng thời
gian đó để không ai tị nạnh nữa.

App phía client: `../mido` (Expo SDK 57).

## Stack

|                |                                                                          |
| -------------- | ------------------------------------------------------------------------ |
| Framework      | [NestJS 11](https://docs.nestjs.com) (Express adapter)                   |
| Language       | TypeScript strict, CommonJS, import tương đối (không dùng path alias)    |
| Validation     | [Zod](https://zod.dev) 4 + [nestjs-zod](https://github.com/BenLorantfy/nestjs-zod) |
| Test           | [Vitest](https://vitest.dev) 4 + `unplugin-swc`                          |
| API docs       | Swagger tại `/docs` (chỉ bật ở local và preview deployment)              |
| Deploy         | [Vercel](https://vercel.com/docs/frameworks/backend/nestjs) — zero config |

### Vì sao Zod + Vitest thay vì class-validator + Jest

NestJS v12 (dự kiến Q3 2026) bỏ class-validator để dùng Standard Schema native trong
`@Body/@Query/@Param`, và đổi default từ Jest sang Vitest. Chọn sẵn Zod + Vitest ngay từ đầu
nghĩa là lúc v12 stable thì migrate gần như không tốn công. Hiện dùng `@nestjs/*` **11.2.1
stable** vì v12 mới chỉ có `12.0.0-alpha.5` trên tag `next`.

## Yêu cầu

- **Node 24** (xem `.nvmrc`). Tối thiểu là 20.19.
- Vercel CLI **>= 48.4.0** cho `vercel dev` và `vc deploy`.

## Bắt đầu

```bash
nvm use
npm install
cp .env.example .env.local   # rồi điền các biến
npm run start:dev
```

```bash
curl http://localhost:3000/health
open http://localhost:3000/docs
```

## Commands

```bash
npm run start:dev     # watch mode
npm run build         # nest build -> dist/
npm run start         # chạy dist/main.js
npm run lint          # eslint 10 flat config
npm run typecheck     # tsc --noEmit
npm test              # unit test (src/**/*.spec.ts)
npm run test:e2e      # e2e test (test/**/*.e2e-spec.ts)
npm run test:cov      # coverage
vercel dev            # mô phỏng môi trường Vercel
vc deploy             # deploy preview
```

## Cấu trúc

```
src/
├── main.ts          # ENTRYPOINT — Vercel detect đúng file này, đừng đổi tên/vị trí
├── app.module.ts
├── config/          # env schema bằng Zod, fail-fast lúc boot
├── common/          # exception filter, guards, decorators, pipes
├── cron/            # route cho Vercel Cron, chặn bằng CRON_SECRET
└── health/
```

Routes có prefix `/v1`, trừ `GET /health` (cố tình để ngoài, cho uptime monitor và smoke test).

## Những chỗ dễ sai khi deploy Vercel

1. **Entrypoint phải là `src/main.ts`** với `await app.listen(...)`. Vercel tự detect và biến
   cả app thành một Function chạy trên Fluid compute. **Không** viết wrapper `api/index.ts`
   như các bài blog cũ hướng dẫn — cách đó giờ đã lỗi thời.
2. **Không dùng path alias `@/*`.** `nest build` và `tsc` không rewrite paths, đây là nguyên
   nhân kinh điển làm NestJS chết trên Vercel. Dùng import tương đối.
3. **Vercel Functions không giữ WebSocket.** Vote realtime sẽ đi qua Supabase Realtime, không
   dùng `@nestjs/websockets`.
4. **`DATABASE_URL` phải trỏ Supavisor transaction pooler (port 6543)** và `postgres.js` phải
   set `prepare: false` — transaction mode không hỗ trợ prepared statement. Migration thì dùng
   `DIRECT_URL` (port 5432).
5. **`vercel.json` ở repo này chỉ khai báo `crons`.** Đừng thêm block `functions` để set
   `maxDuration` — key `functions` chỉ nhận glob khớp file function thật trong `api/`, mà deploy
   zero-config không tạo file nào ở đó, nên `"src/main.ts"` sẽ làm deploy fail với:

   > The pattern "src/main.ts" defined in `functions` doesn't match any Serverless Functions
   > inside the `api` directory.

   (Tài liệu Vercel có hướng dẫn key theo entrypoint, nhưng **chỉ cho framework Python** như
   `app/main.py`.) Muốn đổi max duration thì vào Project → Settings → Functions → Function Max
   Duration. Mặc định đã là **300s trên mọi plan** nên hầu như không cần đổi: pipeline gọi Places
   + Routes chỉ mất vài giây.

## Env vars

Xem `.env.example`. Trên Vercel thì set trong dashboard (Project → Settings → Environment
Variables), không commit file `.env`. Mọi biến được validate bằng Zod lúc boot (`src/config/env.schema.ts`)
để app chết sớm với thông báo rõ ràng thay vì trả 500 lúc runtime.

## Roadmap

| Phase | Nội dung | Trạng thái |
| ----- | -------- | ---------- |
| 0 | Scaffold, health, cron guard, deploy pipeline | ✅ xong |
| 1 | Supabase Postgres + PostGIS, Drizzle schema, auth qua JWKS, guest join | tiếp theo |
| 2 | Lõi midpoint: haversine, geometric median (Weiszfeld), scoring — hàm thuần, test kỹ | |
| 3 | Google Places (New) + Routes API providers, grid snapping, cache | |
| 4 | `POST /v1/hangouts/:id/suggest` end-to-end | |
| 5 | Vote + Supabase Realtime | |
| 6 | Sổ nợ công bằng (fairness ledger) | |

## Ghi chú chi phí

Places Nearby Search kèm field `rating` bị tính theo **Enterprise SKU ($35/1000 call, free tier
chỉ 1.000 call/tháng)**. Ba biện pháp dưới đây là bắt buộc, không phải tối ưu hoá cho vui:

- Snap tâm tìm kiếm về lưới 250m, cache POI trong DB của mình (ToS Google: `place_id` cache
  vô hạn, các field khác tối đa 30 ngày).
- Cắt candidate xuống K ≤ 20 bằng haversine **trước khi** gọi `computeRouteMatrix`.
- Cache route matrix theo time bucket 30 phút.

Trong test dùng fixture đã record, không gọi API thật.
