# mido-api

Backend cho **mido** — app tìm điểm hẹn "ở giữa" cho nhóm bạn đi ăn, cà phê, nhậu, xem phim.
Mục tiêu: chọn chỗ dựa trên **thời gian di chuyển thực tế của từng người**, và show ra bảng thời
gian đó để không ai tị nạnh nữa.

App phía client: `../mido` (Expo SDK 57).

## Stack

|            |                                                                                    |
| ---------- | ---------------------------------------------------------------------------------- |
| Framework  | [NestJS 11](https://docs.nestjs.com) (Express adapter)                             |
| Language   | TypeScript strict, CommonJS, import tương đối (không dùng path alias)              |
| Validation | [Zod](https://zod.dev) 4 + [nestjs-zod](https://github.com/BenLorantfy/nestjs-zod) |
| Test       | [Vitest](https://vitest.dev) 4 + `unplugin-swc`                                    |
| API docs   | Swagger tại `/docs` (chỉ bật ở local và preview deployment)                        |
| Deploy     | [Vercel](https://vercel.com/docs/frameworks/backend/nestjs) — zero config          |

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
├── auth/            # verify Supabase access token bằng JWKS; guest = anonymous user
├── config/          # env schema bằng Zod, fail-fast lúc boot
├── common/          # exception filter, guards, decorators, pipes
├── cron/            # route cho Vercel Cron, chặn bằng CRON_SECRET
├── database/        # Drizzle + postgres.js; schema Phase 1
├── fairness/        # decide/complete outing, fairness ledger và priority weight thuần
├── midpoint/        # geometry/scoring thuần + POST /v1/midpoint/preview
├── places/          # PlacesProvider + Google Nearby Search (New)
├── providers/       # Google HTTP client, grid 250m và policy dùng chung
├── routing/         # RoutingProvider + Google Compute Route Matrix
├── suggestions/     # /suggest pipeline, activity/filtering và DB repository
├── votes/           # upsert vote API + tally; realtime đọc từ Supabase
└── health/
```

## Places và Routes providers

`PlacesProvider` và `RoutingProvider` là interface/token DI, hiện được implement bằng Google Maps.
Nearby Search luôn snap tâm vào grid Web Mercator 250m, giới hạn tối đa 20 kết quả và gửi field mask
chính xác thay vì wildcard. Route Matrix tự group participant theo travel mode vì Google chỉ nhận một
`travelMode` cho mỗi request; batch transit được tự chia để không vượt 100 elements.

Provider có timeout, circuit breaker và budget theo ngày trên từng process. Budget trong app chỉ là
hàng rào best-effort vì Vercel có thể scale nhiều instance; quota cứng và billing alert vẫn phải đặt
trong Google Cloud Console.

Policy lưu trữ được encode cả trong provider lẫn database:

- `provider_place_refs` chỉ lưu provider + external place ID; Google place ID được phép lưu dài hạn.
- `place_content_cache` và `route_matrix_cache` dành cho provider có license cho phép cache content.
- Constraint DB từ chối `google_maps` trong hai bảng content cache, tránh vô tình lưu name/rating,
  opening hours hay route duration của Google.
- `GET /v1/cron/prune-cache` xóa các record cache đã hết hạn.

Test provider đọc fixture trong `test/fixtures/google/`; không gọi Google API thật.

## Suggest pipeline

`POST /v1/hangouts/:id/suggest` chỉ cho member của group và nhận body tùy chọn:

```json
{ "topN": 5, "minimumRating": 4 }
```

Pipeline đọc hangout + participant từ Postgres, tính geometric median, tìm tối đa 20 Places,
lọc business status/opening hours/budget/rating, gọi Route Matrix rồi chấm điểm theo fairness mode.
Mỗi suggestion luôn có:

```json
{
  "id": "provider-place-id",
  "suggestionId": "stable-option-uuid",
  "score": 0.82,
  "travelTimes": [
    { "participantId": "...", "name": "Nam", "durationSec": 720, "mode": "two_wheeler" }
  ]
}
```

Candidate thiếu route của bất kỳ participant nào sẽ bị loại. Time cap là veto cứng; nếu veto loại
hết thì response đặt `meta.capRelaxed = true`. Nhóm phân tán trên 25 km trả
`status: "split_recommended"` trước khi gọi provider tính phí.

Activity hiện hỗ trợ `food`/`ăn`, `cafe`/`cà phê`, `drinks`/`nhậu`, `movie`/`phim`, `karaoke`
và `bowling`. `budgetMax` đang được hiểu là VND/người và quy đổi sang price level bằng heuristic
MVP; cần thay bằng preference rõ ràng từ client nếu muốn chính xác hơn.

Response hiện được tính và trả trực tiếp, không persist Google place content hay route duration.
Vì vậy client không nên tự động retry `POST /suggest`; idempotency bền vững cần được thiết kế cùng
provider/license cho phép lưu snapshot trước khi bật retry trong production.

### Vote và Realtime

Mỗi option trả về có `suggestionId`. Participant tạo hoặc đổi vote qua:

```http
POST /v1/suggestions/:suggestionId/votes
Authorization: Bearer <supabase-access-token>
Content-Type: application/json

{ "value": "up" }
```

`value` là `up`, `down` hoặc `veto`; response trả vote hiện tại và tally. Database chỉ persist
provider place ID, rank và trạng thái active, không persist Google content/route duration. Client
subscribe `postgres_changes` trên `suggestions` và `votes`; RLS chỉ cho authenticated group member
nhận event. Role client chỉ có SELECT, mọi thao tác ghi vote phải đi qua Nest API.

### Fairness ledger

Owner/admin chốt một option đang active, sau đó hoàn tất kèo bằng thời gian di chuyển **thực tế**
đã được nhóm xác nhận:

```http
POST /v1/hangouts/:hangoutId/decide
{ "suggestionId": "..." }

POST /v1/hangouts/:hangoutId/complete
{
  "happenedAt": "2026-08-24T12:00:00+07:00",
  "actualTravelTimes": [
    { "participantId": "...", "durationSec": 600 },
    { "participantId": "...", "durationSec": 1200 }
  ]
}
```

`/complete` bắt buộc có đúng toàn bộ participant và idempotent khi retry cùng số liệu. Delta của
mỗi outing luôn có tổng bằng 0: người đi lâu hơn trung bình nhận debt dương, người đi ngắn hơn nhận
debt âm. Member đọc số dư hiện tại qua `GET /v1/groups/:groupId/fairness`.

Lần `/suggest` sau dùng debt để điều chỉnh trọng số geometric median trong khoảng ±40%; response
trả chi tiết tại `meta.fairness` để client giải thích vì sao midpoint được kéo về phía một người.
Thời gian ước tính từ Google Routes không được ghi vào ledger hay database; chỉ actual time do nhóm
xác nhận mới được persist.

## Database và auth

Migration nằm trong `drizzle/`. Runtime dùng `DATABASE_POSTGRES_URL` qua Supavisor transaction mode
và `prepare: false`; Drizzle CLI dùng `DATABASE_POSTGRES_URL_NON_POOLING` riêng:

```bash
npm run db:check
npm run db:migrate
```

Mọi bảng public đều bật RLS. Phần lớn là default-deny; riêng `suggestions`, `votes` và
`provider_place_refs` có SELECT policy cho authenticated group member để dùng Supabase Realtime.
Nest kết nối bằng database role nên service vẫn phải kiểm tra participant/membership; không được coi
RLS là thay thế cho authorization của API.

Guest dùng **Supabase Anonymous Sign-In**, không dùng JWT tự ký. Anonymous user vẫn có `auth.sub`,
access token chuẩn và profile tương ứng, nên vote/participant luôn gắn được với một identity. Client
gọi `supabase.auth.signInAnonymously()` rồi gửi access token qua `Authorization: Bearer ...`.

Routes có prefix `/v1`, trừ `GET /health` (cố tình để ngoài, cho uptime monitor và smoke test).

## Những chỗ dễ sai khi deploy Vercel

1. **Entrypoint phải là `src/main.ts`** với `await app.listen(...)`. Vercel tự detect và biến
   cả app thành một Function chạy trên Fluid compute. **Không** viết wrapper `api/index.ts`
   như các bài blog cũ hướng dẫn — cách đó giờ đã lỗi thời.
2. **Không dùng path alias `@/*`.** `nest build` và `tsc` không rewrite paths, đây là nguyên
   nhân kinh điển làm NestJS chết trên Vercel. Dùng import tương đối.
3. **Vercel Functions không giữ WebSocket.** Vote realtime sẽ đi qua Supabase Realtime, không
   dùng `@nestjs/websockets`.
4. **`DATABASE_POSTGRES_URL` phải trỏ Supavisor transaction pooler (port 6543)** và `postgres.js`
   phải set `prepare: false` — transaction mode không hỗ trợ prepared statement. Migration thì dùng
   `DATABASE_POSTGRES_URL_NON_POOLING` (port 5432).
5. **`vercel.json` ở repo này chỉ khai báo `crons`.** Đừng thêm block `functions` để set
   `maxDuration` — key `functions` chỉ nhận glob khớp file function thật trong `api/`, mà deploy
   zero-config không tạo file nào ở đó, nên `"src/main.ts"` sẽ làm deploy fail với:

   > The pattern "src/main.ts" defined in `functions` doesn't match any Serverless Functions
   > inside the `api` directory.

   (Tài liệu Vercel có hướng dẫn key theo entrypoint, nhưng **chỉ cho framework Python** như
   `app/main.py`.) Muốn đổi max duration thì vào Project → Settings → Functions → Function Max
   Duration. Mặc định đã là **300s trên mọi plan** nên hầu như không cần đổi: pipeline gọi Places
   - Routes chỉ mất vài giây.

## Env vars

Xem `.env.example`. Trên Vercel thì set trong dashboard (Project → Settings → Environment
Variables), không commit file `.env`. Mọi biến được validate bằng Zod lúc boot (`src/config/env.schema.ts`)
để app chết sớm với thông báo rõ ràng thay vì trả 500 lúc runtime.

Backend đọc trực tiếp tên biến do Supabase Marketplace custom prefix `DATABASE` tạo:
`DATABASE_POSTGRES_URL`, `DATABASE_SUPABASE_URL` và `DATABASE_POSTGRES_URL_NON_POOLING`. Không có
lớp alias hay tên canonical trung gian. Các publishable/anon/secret/service-role key do integration
tạo hiện không được backend này sử dụng.

## Roadmap

| Phase | Nội dung                                                                            | Trạng thái |
| ----- | ----------------------------------------------------------------------------------- | ---------- |
| 0     | Scaffold, health, cron guard, deploy pipeline                                       | ✅ xong    |
| 1     | Supabase Postgres + PostGIS, Drizzle schema, auth qua JWKS, anonymous guest         | ✅ xong    |
| 2     | Lõi midpoint: haversine, modified Weiszfeld, minimax/scoring, preview endpoint      | ✅ xong    |
| 3     | Places/Routes providers, field mask, grid 250m, quota/circuit breaker, cache policy | ✅ xong    |
| 4     | `POST /v1/hangouts/:id/suggest` end-to-end, trả travel time từng người              | ✅ xong    |
| 5     | Vote API + RLS + Supabase Realtime                                                  | ✅ xong    |
| 6     | Sổ nợ công bằng (fairness ledger)                                                   | ✅ xong    |

## Ghi chú chi phí

Places Nearby Search kèm field `rating` bị tính theo **Enterprise SKU ($35/1000 call, free tier
chỉ 1.000 call/tháng)**. Kiểm soát chi phí bằng các biện pháp sau:

- Chỉ request field mask thật sự dùng; các field Atmosphere như parking/vegetarian làm request
  chuyển sang SKU cao hơn.
- Cắt candidate xuống K ≤ 20 bằng haversine **trước khi** gọi `computeRouteMatrix`.
- Rate limit, budget/quota alert; không bật client retry cho `/suggest` khi chưa có idempotency bền vững.

Không lưu Places/Routes content ngoài ngoại lệ được điều khoản hiện hành cho phép. Với Google,
`place_id` có thể lưu lâu dài nhưng không mặc định coi name/rating/opening hours hay route duration
là cache được 30 ngày. Nếu cần cache để đạt economics mong muốn, phải dùng provider/license cho
phép. Places/Routes content hiển thị trên bản đồ phải dùng Google Map và có attribution đúng.

Trong test dùng fixture đã record, không gọi API thật.
