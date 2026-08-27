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
├── places/          # Google Nearby/Text Search/Place Photo + bảng dịch place type
├── providers/       # HTTP clients, grid 250m và policy dùng chung
├── routing/         # Google Route Matrix provider
├── suggestions/     # /suggest pipeline, activity/filtering và DB repository
├── votes/           # upsert vote API + tally; realtime đọc từ Supabase
└── health/
```

## Places và Routes providers

Toàn bộ chức năng bản đồ chạy trên Google Maps Platform, không còn provider thứ hai để chuyển qua
lại:

| Chức năng            | API                                | Dùng ở đâu                    |
| -------------------- | ---------------------------------- | ----------------------------- |
| Tìm địa điểm quanh midpoint | Places API (New) Nearby Search | `POST /v1/hangouts/:id/suggest` |
| Tìm vị trí theo tên  | Places API (New) Text Search       | `GET /v1/places/search`       |
| Ảnh địa điểm         | Places API (New) Place Photo       | `images` trong `/suggest`     |
| Thời gian di chuyển  | Routes API `computeRouteMatrix`    | `POST /v1/hangouts/:id/suggest` |

Nearby Search tìm tối đa 20 địa điểm với tâm đã snap vào grid Web Mercator 250m. Route Matrix group
participant theo travel mode, dùng traffic-aware cho ô tô/xe máy và tự chia batch transit để không
vượt 100 elements.

Provider có timeout, circuit breaker và budget theo ngày trên từng process. Budget trong app chỉ là
hàng rào best-effort vì Vercel có thể scale nhiều instance; quota cứng/billing alert vẫn phải đặt ở
Google Cloud Console.

Policy lưu trữ được encode cả trong provider lẫn database:

- `provider_place_refs` chỉ lưu provider + external place ID.
- `place_content_cache` và `route_matrix_cache` dành cho provider có license cho phép cache content.
- Constraint DB từ chối `google_maps` trong hai bảng content cache, tránh vô tình lưu content bị
  giới hạn bởi điều khoản Google. Với setup hiện tại hai bảng này luôn rỗng.
- `GET /v1/cron/prune-cache` xóa các record cache đã hết hạn.
- **Ngoại lệ có chủ đích: `suggestion_places`.** Xem "Snapshot gợi ý" bên dưới.

Test provider đọc fixture trong `test/fixtures/google/`; không gọi API Google thật.

Client tìm vị trí xuất phát theo tên hoặc địa chỉ qua endpoint private:

```http
GET /v1/places/search?q=Landmark%2081&lat=10.7769&lng=106.7009&radiusMeters=20000&limit=5
Authorization: Bearer <supabase-access-token>
```

`lat` và `lng` là location bias tùy chọn (phải gửi cùng nhau), `radiusMeters` mặc định 50 km và
`limit` mặc định 5, tối đa 10. Bias chứ không phải restriction: gõ tên quán ở tỉnh khác vẫn ra kết
quả, chỉ bị xếp sau. Backend chuẩn hóa response thành `provider: "google_maps"`, `placeId`, tên, địa
chỉ và `location { lat, lng }` để client đặt pin ngay, kèm `attribution: "Powered by Google"` —
điều khoản Google Maps Platform bắt buộc render chuỗi này.

### Place type hiển thị

Google trả place type dạng key (`coffee_shop`, `shopping_mall`, `point_of_interest`). Cả
`/v1/places/search` lẫn `/suggest` trả thêm `typeLabels` và `primaryTypeLabel` đã dịch sang tiếng
Việt, `primaryType` đứng đầu danh sách:

```json
{
  "primaryType": "cafe",
  "types": ["cafe", "coffee_shop", "food", "point_of_interest"],
  "primaryTypeLabel": "Quán cà phê",
  "typeLabels": ["Quán cà phê"]
}
```

Bảng dịch nằm ở `src/places/place-types.ts`. Type chung chung (`point_of_interest`, `establishment`,
`food`) và nhãn hành chính của Geocoding bị loại hẳn; type Google mới thêm mà bảng chưa có thì được
viết hoa lại (`pickleball_court` → `Pickleball court`) để UI không bao giờ lòi snake_case. Trường
`types` gốc vẫn giữ nguyên cho client nào cần lọc theo key.

## Sửa và xóa nhóm/kèo

Các route đều private và cần Supabase access token:

```http
PATCH /v1/groups/:groupId
{ "name": "Nhóm cuối tuần" }

DELETE /v1/groups/:groupId

PATCH /v1/hangouts/:hangoutId
{
  "activityType": "ăn",
  "plannedAt": "2026-08-26T19:00:00+07:00",
  "fairnessMode": "balanced",
  "budgetMax": null,
  "timeCapSeconds": 1800
}

DELETE /v1/hangouts/:hangoutId
```

Owner/admin được đổi tên nhóm; chỉ owner được xóa nhóm. Xóa nhóm là HTTP 204 và cascade toàn bộ
membership, kèo, vote, outing và fairness ledger thuộc nhóm trong cùng câu lệnh database. Với kèo,
creator hoặc owner/admin được quản lý. Chỉ kèo `draft`/`voting` được sửa; kèo `decided`/`done` trả
409 khi sửa hoặc xóa để không làm mất lịch sử outing/fairness. Gửi `budgetMax: null` để bỏ giới hạn
ngân sách. DELETE thành công trả HTTP 204.

## Xóa tài khoản

`DELETE /v1/auth/me` xóa vĩnh viễn Supabase Auth user hiện tại. Foreign key cascade đồng thời xóa
profile, nhóm/kèo do người đó tạo, membership, vị trí, participant, vote và fairness ledger liên
quan. Outing chung vẫn được giữ nhưng `decided_by` được đặt `NULL` để không còn liên kết nhận dạng.
Route chấp nhận cả tài khoản email và anonymous account, trả HTTP 204 khi hoàn tất.

Backend gọi Supabase Admin API bằng `DATABASE_SUPABASE_SERVICE_ROLE_KEY`; đây là secret server-only,
không được đưa vào app Expo hoặc bất kỳ biến `EXPO_PUBLIC_*` nào.

## Suggest pipeline

`POST /v1/hangouts/:id/suggest` chỉ cho member của group và nhận body tùy chọn:

```json
{ "topN": 20, "minimumRating": 4 }
```

`topN` mặc định 5, tối đa 20 — đúng bằng số candidate mà pipeline đã gọi Route Matrix (và trả tiền)
cho.

Pipeline đọc hangout + participant từ Postgres, tính geometric median, tìm tối đa 20 Places,
lọc business status/opening hours/budget/rating, gọi Route Matrix rồi chấm điểm theo fairness mode.
Mỗi suggestion luôn có:

```json
{
  "id": "provider-place-id",
  "suggestionId": "stable-option-uuid",
  "provider": "google_maps",
  "primaryTypeLabel": "Quán cà phê",
  "typeLabels": ["Quán cà phê"],
  "images": ["https://lh3.googleusercontent.com/..."],
  "mapsUri": "https://maps.google.com/?cid=...",
  "score": 0.82,
  "travelTimes": [
    { "participantId": "...", "name": "Nam", "durationSec": 720, "mode": "two_wheeler" }
  ]
}
```

`images` có tối đa 1 URL mỗi địa điểm. Nearby Search chỉ trả photo reference, nên backend gọi thêm
Place Photo với `skipHttpRedirect=true` để lấy `photoUri` đã ký — API key không bao giờ đi ra client.
Photo chỉ được resolve cho đúng các option trả về (`topN`), không phải cả 20 candidate; đổi lại mỗi
lần `/suggest` tốn thêm tối đa `topN` request Place Photo, budget đặt ở
`GOOGLE_PLACE_PHOTO_DAILY_REQUEST_LIMIT`. Nếu Place Photo lỗi hoặc địa điểm không có ảnh thì API trả
`images: []` chứ không fail cả request. Backend chỉ chuyển tiếp URL, không tải hay cache file ảnh —
`photoUri` của Google có hạn sử dụng nên client không được lưu lại.

Candidate thiếu route của bất kỳ participant nào sẽ bị loại. Time cap là veto cứng; nếu veto loại
hết thì response đặt `meta.capRelaxed = true`. Nhóm phân tán trên 25 km trả
`status: "split_recommended"` trước khi gọi provider tính phí.

Activity hiện hỗ trợ `food`/`ăn`, `cafe`/`cà phê`, `drinks`/`nhậu`, `movie`/`phim`, `karaoke`
và `bowling`. `budgetMax` đang được hiểu là VND/người và quy đổi sang price level bằng heuristic
MVP; cần thay bằng preference rõ ràng từ client nếu muốn chính xác hơn.

Response hiện được tính và trả trực tiếp, không persist place content hay route duration.
Vì vậy client không nên tự động retry `POST /suggest`; idempotency bền vững cần được thiết kế cùng
provider/license cho phép lưu snapshot trước khi bật retry trong production.

### "Suggest lại" phải xoay vòng ở client

`/suggest` là hàm thuần theo participant, `plannedAt`, `fairnessMode`, `budgetMax` và `timeCapSeconds`
— không có random, không phụ thuộc thời điểm gọi. Gọi lại với cùng input sẽ trả về **đúng danh sách
cũ**, trong khi vẫn tốn 1 Nearby Search + Route Matrix + `topN` Place Photo. Đừng map nút "suggest
lại" thành một request mới.

Cách đúng: xin `topN: 20` một lần, đọc lại qua `GET :id/suggestions`, rồi mỗi lần bấm thì hiện 5
option kế tiếp và quay vòng khi hết. Cả 20 option đều được persist với `isActive = true` và có
`suggestionId` riêng, nên vote đặt ở trang nào cũng hợp lệ và không mất khi xoay vòng.

Pool không còn chỉ nằm trong state màn hình: `suggestion_places` giữ nó lại, nên đóng app mở lại
vẫn xoay vòng được trên đúng 20 quán đó mà không tốn thêm đồng nào.

Chỉ gọi lại API khi input thực sự đổi — thêm/bớt participant, đổi `plannedAt`, `fairnessMode`,
`budgetMax`, `timeCapSeconds` hoặc `minimumRating`.

### Vote và Realtime

Mỗi option trả về có `suggestionId`. Participant tạo hoặc đổi vote qua:

```http
POST /v1/suggestions/:suggestionId/votes
Authorization: Bearer <supabase-access-token>
Content-Type: application/json

{ "value": "up" }
```

`value` là `up`, `down` hoặc `veto`; response trả vote hiện tại và tally. Database chỉ persist
provider place ID, rank và trạng thái active, không persist provider content/route duration. Client
subscribe `postgres_changes` trên `suggestions` và `votes`; RLS chỉ cho authenticated group member
nhận event. Role client chỉ có SELECT, mọi thao tác ghi vote phải đi qua Nest API.

### Snapshot gợi ý

`suggestions` chỉ lưu place ID, rank và `is_active` — nên trước đây tên quán, ảnh, rating và thời
gian di chuyển của từng người chỉ tồn tại trong response `/suggest` và biến mất khi client đóng app.
Hai hệ quả: kèo đã chốt mở lại không còn thấy quán, và mở lại màn gợi ý là bắn một `/suggest` mới —
Places + Route Matrix cho tới 20 quán, mỗi người trong nhóm một lần.

`POST /v1/hangouts/:id/suggest` giờ ghi luôn snapshot vào `suggestion_places`, một hàng cho mỗi
option. Client đọc lại miễn phí:

```http
GET /v1/hangouts/:hangoutId/suggestions
Authorization: Bearer <supabase-access-token>
```

Nhận `offset` và `limit` (mặc định 0 và 5, trần 20), trả `{ suggestions, total, offset }` theo đúng
rank lúc suggest. Mỗi phần tử có `name`, `address`, `location`, `typeLabels`, `rating`, `images`,
`travelTimes`, `score`/`scoreBreakdown` và `tally` vote hiện tại. **Client phải gọi endpoint này
trước**; chỉ khi `total` bằng 0 mới được `POST :id/suggest`, vì đó mới là request tính tiền.

`GET /v1/hangouts/:hangoutId/suggestions/:suggestionId` trả đúng một option, để màn chi tiết không
phải đoán nó nằm ở trang nào.

Ảnh chỉ resolve cho hàng thực sự trả về, nên xin cả pool 20 thì tốn tối đa 20 request Place Photo —
`/suggest` đã lưu sẵn URL nó vừa resolve nên lần đọc đầu là miễn phí.

`GET /v1/hangouts/:id` của kèo đã chốt trả thêm `outing.place` với đúng shape đó, đọc qua
`outings.chosen_suggestion_id`.

Vài điểm cần biết trước khi sửa chỗ này:

- **Bảng này cố ý giữ content vĩnh viễn**, không TTL và không nằm trong `prune-cache`. Chủ sản phẩm
  chọn như vậy để xem lại lịch sử kèo cũ và để không ai trả tiền `/suggest` hai lần. Hệ quả: cả
  place content lẫn route duration được giữ quá thời hạn mà điều khoản Google Maps Platform cho
  phép — đây là quyết định sản phẩm, không phải sơ suất. Muốn quay về đúng điều khoản thì bỏ bảng
  này và resolve Place Details ngay lúc đọc.
- **Hàng của option đã chốt không bao giờ bị ghi đè**: `/suggest` bị chặn khi kèo ở trạng thái
  `decided`/`done`/`cancelled`, nên bấm "tìm lại" không thể làm hỏng bản ghi lịch sử. Đó cũng là lý
  do outing không cần bảng riêng.
- **Ảnh lưu resource name, không lưu URL.** `photoUri` của Google hết hạn sau ít phút. `photo_uri`
  chỉ là bản dùng lại trong 5 phút để mở đi mở lại không tốn thêm request Place Photo.
- Kèo chốt từ trước khi có bảng này được lấp lười: lần đầu ai đó mở chi tiết kèo, API đọc lại nội
  dung bằng Place Details từ place ID đã lưu rồi ghi vào hàng của option đã chốt. `travelTimes` để
  rỗng — số phút của lần suggest đó đã mất, không bịa được. Không cần backfill tay.
- Ghi snapshot là best-effort ở cả hai đường: ghi hỏng thì `/suggest` vẫn trả response bình thường,
  và đọc hỏng thì trả rỗng để client quay về `/suggest` chứ không 500.
- Field mask của Place Details quyết định SKU, nên chỉ xin đúng field màn "Đã chốt" render. Không
  xin `regularOpeningHours`: giờ mở cửa đổi theo thời gian, snapshot chỉ sinh ra thông tin sai.

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

Mọi bảng public đều bật RLS. Phần lớn là default-deny; riêng `participants`, `suggestions`, `votes`
và `provider_place_refs` có SELECT policy cho authenticated group member để dùng Supabase Realtime.
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

Tất cả chức năng bản đồ đọc chung `GOOGLE_MAPS_API_KEY`. Mỗi API có budget best-effort riêng:
`GOOGLE_PLACES_DAILY_REQUEST_LIMIT` (Nearby), `GOOGLE_TEXT_SEARCH_DAILY_REQUEST_LIMIT`,
`GOOGLE_PLACE_PHOTO_DAILY_REQUEST_LIMIT` và `GOOGLE_ROUTES_DAILY_ELEMENT_LIMIT`.
`GOOGLE_PLACE_PHOTO_MAX_WIDTH_PX` (mặc định 800) quyết định kích thước ảnh xin từ Place Photo.

Nếu Google trả `403 PERMISSION_DENIED`, kiểm tra trong đúng Google Cloud project của API key:

1. **APIs & Services → Enabled APIs** đã bật **Places API (New)** và **Routes API**.
2. **Credentials → API key → API restrictions** đã cho phép cả hai. Place Photo và Text Search nằm
   trong Places API (New), không phải API riêng.
3. Key dùng bởi Nest/Vercel là key riêng cho web service; không gắn restriction kiểu Android, iOS
   hoặc HTTP referrer. Nếu dùng IP restriction thì IP outbound của môi trường chạy phải nằm trong
   allowlist.

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

Nearby Search kèm field `rating` đã đẩy request vào Enterprise SKU, nên `places.photos` (Pro) không
làm tăng bậc SKU. Kiểm soát chi phí bằng các biện pháp sau:

- Chỉ request field mask thật sự dùng; các field Atmosphere như parking/vegetarian làm request
  chuyển sang SKU cao hơn.
- Cắt candidate xuống K ≤ 20 bằng haversine **trước khi** gọi `computeRouteMatrix`.
- Place Photo là một SKU riêng tính theo từng request. Mỗi `/suggest` tốn tối đa `topN` request, và
  `topN: 20` là mặc định khuyến nghị cho client — vì vậy `GOOGLE_PLACE_PHOTO_DAILY_REQUEST_LIMIT`
  mặc định 2000 chứ không phải 500. Hạ `topN` nếu ảnh không đáng tiền.
- Không map nút "suggest lại" của client thành request mới: kết quả deterministic nên tiền bỏ ra
  không đổi lấy được thông tin gì.
- Rate limit, budget/quota alert; không bật client retry cho `/suggest` khi chưa có idempotency bền vững.

Không lưu Places/Routes content ngoài `suggestion_places` (xem "Snapshot gợi ý"). Với Google, `place_id` có thể lưu lâu dài nhưng không mặc định coi name/rating/opening hours hay route
duration là cache được 30 ngày. Nếu cần cache để đạt economics mong muốn, phải dùng
provider/license cho phép. Places/Routes content hiển thị trên bản đồ phải dùng Google Map và có
attribution đúng.

Trong test dùng fixture đã record, không gọi API thật.
