/**
 * Seed dữ liệu mẫu để chụp ảnh App Store.
 *
 * Chạy:
 *   node --env-file=.env scripts/seed-screenshots.mjs            # gắn vào guest mới nhất
 *   node --env-file=.env scripts/seed-screenshots.mjs --owner <uuid>
 *   node --env-file=.env scripts/seed-screenshots.mjs --clean    # xoá sạch phần seed
 *
 * Chủ sở hữu mặc định là anonymous user mới nhất trong `auth.users` — tức là
 * phiên khách vừa mở trên simulator. Nhờ vậy không phải đăng nhập bằng mật khẩu
 * để có dữ liệu trên máy.
 *
 * Mọi id đều cố định (xem UUID phía dưới) nên chạy lại nhiều lần không sinh
 * thêm bản ghi rác, và `--clean` xoá được đúng những gì script này tạo ra.
 *
 * Script KHÔNG tạo suggestions: `suggestion_places` là snapshot nội dung
 * Google, phải để chính app gọi `/suggest` sinh ra mới đúng điều khoản và mới
 * có ảnh quán thật.
 */

import { createHash } from 'node:crypto';

import postgres from 'postgres';

const MARK = 'seed-screenshots';

// Id cố định để script idempotent.
const GROUP_ID = '5eed0000-0000-4000-8000-000000000001';
const HANGOUT_VOTING = '5eed0000-0000-4000-8000-000000000010';
const HANGOUT_DONE_1 = '5eed0000-0000-4000-8000-000000000011';
const HANGOUT_DONE_2 = '5eed0000-0000-4000-8000-000000000012';
const OUTING_1 = '5eed0000-0000-4000-8000-000000000020';
const OUTING_2 = '5eed0000-0000-4000-8000-000000000021';

const INVITE_CODE = 'MIDO2026';

/** Ba người bạn ảo. Email dùng domain example.com để không đụng hộp thư thật. */
const FRIENDS = [
  {
    key: 'minh',
    email: 'seed.minh@example.com',
    displayName: 'Minh',
    travelMode: 'two_wheeler',
    // Thủ Đức — người ở xa nhất, để sổ công bằng có ý nghĩa.
    lng: 106.762,
    lat: 10.851,
    address: 'Đường Võ Văn Ngân, Thủ Đức',
  },
  {
    key: 'trang',
    email: 'seed.trang@example.com',
    displayName: 'Trang',
    travelMode: 'two_wheeler',
    lng: 106.7222,
    lat: 10.7379,
    address: 'Nguyễn Thị Thập, Quận 7',
  },
  {
    key: 'huy',
    email: 'seed.huy@example.com',
    displayName: 'Huy',
    travelMode: 'drive',
    lng: 106.698,
    lat: 10.7725,
    address: 'Lê Lợi, Quận 1',
  },
];

/** Chủ nhóm: phiên khách trên simulator. */
const OWNER = {
  displayName: 'Ly',
  travelMode: 'two_wheeler',
  lng: 106.7139,
  lat: 10.8039,
  address: 'Điện Biên Phủ, Bình Thạnh',
};

const args = process.argv.slice(2);
const clean = args.includes('--clean');
const ownerArg = args[args.indexOf('--owner') + 1];
const ownerOverride = args.includes('--owner') ? ownerArg : null;

const connectionString =
  process.env.DATABASE_POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_POSTGRES_URL;
const supabaseUrl = process.env.DATABASE_SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = process.env.DATABASE_SUPABASE_SERVICE_ROLE_KEY;

if (!connectionString) {
  throw new Error('Thiếu DATABASE_POSTGRES_URL(_NON_POOLING) — chạy kèm `node --env-file=.env`.');
}
if (!supabaseUrl || !serviceKey) {
  throw new Error('Thiếu DATABASE_SUPABASE_URL hoặc DATABASE_SUPABASE_SERVICE_ROLE_KEY.');
}

const sql = postgres(connectionString, { prepare: false, max: 1 });

/** Supabase Admin API — trigger `on_auth_user_created` tự tạo profiles. */
async function admin(path, init = {}) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Admin API ${path} → ${response.status}: ${await response.text()}`);
  }

  return response.status === 204 ? null : await response.json();
}

async function findAuthUserByEmail(email) {
  const [row] = await sql`
    select id from auth.users where email = ${email} limit 1
  `;
  return row?.id ?? null;
}

async function ensureFriend(friend) {
  const existing = await findAuthUserByEmail(friend.email);
  if (existing) return existing;

  const created = await admin('users', {
    method: 'POST',
    body: JSON.stringify({
      email: friend.email,
      // Mật khẩu ngẫu nhiên, không dùng để đăng nhập ở đâu cả — các tài khoản
      // này chỉ tồn tại để làm thành viên nhóm trong ảnh chụp.
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { display_name: friend.displayName, [MARK]: true },
    }),
  });

  return created.id;
}

async function resolveOwner() {
  if (ownerOverride) return ownerOverride;

  const [row] = await sql`
    select id, created_at
    from auth.users
    where is_anonymous = true
    order by created_at desc
    limit 1
  `;

  if (!row) {
    throw new Error(
      'Không tìm thấy anonymous user nào. Mở app trên simulator, bấm "dùng thử không cần tài khoản", rồi chạy lại.',
    );
  }

  return row.id;
}

function point(lng, lat) {
  return sql`ST_GeogFromText(${`SRID=4326;POINT(${lng} ${lat})`})`;
}

async function wipe() {
  // groups cascade xuống members/hangouts/participants/outings/ledger.
  await sql`delete from groups where id = ${GROUP_ID}`;
  await sql`delete from saved_locations where label in ('Nhà', 'Công ty')`;

  for (const friend of FRIENDS) {
    const id = await findAuthUserByEmail(friend.email);
    if (id) await admin(`users/${id}`, { method: 'DELETE' });
  }

  console.log('Đã xoá dữ liệu seed.');
}

async function seed() {
  const ownerId = await resolveOwner();
  console.log(`Chủ nhóm: ${ownerId}`);

  const friendIds = {};
  for (const friend of FRIENDS) {
    friendIds[friend.key] = await ensureFriend(friend);
    console.log(`  ${friend.displayName}: ${friendIds[friend.key]}`);
  }

  await sql`
    update profiles
    set display_name = ${OWNER.displayName}, default_travel_mode = ${OWNER.travelMode}
    where id = ${ownerId}
  `;

  /*
    Màn Trang chủ lấy tên từ `user_metadata.display_name` của phiên, không phải
    từ `profiles` — xem `displayName` trong src/lib/auth.tsx. Không sửa cả hai
    thì lời chào vẫn là "Khách" dù bảng profiles đã đổi.

    Phiên đang lưu trên máy vẫn giữ metadata cũ cho tới khi token được làm mới,
    nên sau bước này phải xoá app rồi cài lại (hoặc đợi token hết hạn).
  */
  await admin(`users/${ownerId}`, {
    method: 'PUT',
    body: JSON.stringify({ user_metadata: { display_name: OWNER.displayName } }),
  });

  const inviteHash = createHash('sha256').update(INVITE_CODE).digest('hex');

  await sql`
    insert into groups (id, name, invite_code_hash, invite_expires_at, created_by)
    values (
      ${GROUP_ID}, 'Hội bạn thân', ${inviteHash}, now() + interval '30 days', ${ownerId}
    )
    on conflict (id) do update
      set name = excluded.name,
          invite_code_hash = excluded.invite_code_hash,
          invite_expires_at = excluded.invite_expires_at,
          created_by = excluded.created_by
  `;

  const members = [
    { userId: ownerId, role: 'owner' },
    ...FRIENDS.map((friend) => ({ userId: friendIds[friend.key], role: 'member' })),
  ];

  for (const member of members) {
    await sql`
      insert into group_members (group_id, user_id, role)
      values (${GROUP_ID}, ${member.userId}, ${member.role})
      on conflict (group_id, user_id) do update set role = excluded.role
    `;
  }

  // Địa điểm lưu sẵn của chủ nhóm — màn "Địa điểm của tôi" cần có gì đó.
  const savedLocations = [
    { label: 'Nhà', lng: OWNER.lng, lat: OWNER.lat, address: OWNER.address },
    { label: 'Công ty', lng: 106.7009, lat: 10.7769, address: 'Nguyễn Huệ, Quận 1' },
  ];

  for (const location of savedLocations) {
    await sql`
      insert into saved_locations (user_id, label, geog, address)
      values (${ownerId}, ${location.label}, ${point(location.lng, location.lat)}, ${location.address})
      on conflict (user_id, label) do update
        set geog = excluded.geog, address = excluded.address
    `;
  }

  const hangouts = [
    {
      id: HANGOUT_VOTING,
      activityType: 'food',
      // 19:30 giờ VN, hai ngày nữa. Tính trong 'Asia/Ho_Chi_Minh' rồi đổi ngược
      // về timestamptz, nếu không giờ hiển thị trên máy sẽ rơi vào rạng sáng.
      plannedAt: sql`
        (date_trunc('day', (now() at time zone 'Asia/Ho_Chi_Minh'))
          + interval '2 days' + interval '19 hours 30 minutes')
        at time zone 'Asia/Ho_Chi_Minh'
      `,
      status: 'voting',
      budgetMax: 250000,
      timeCapSeconds: 1800,
    },
    {
      id: HANGOUT_DONE_1,
      activityType: 'cafe',
      plannedAt: sql`
        (date_trunc('day', (now() at time zone 'Asia/Ho_Chi_Minh'))
          - interval '9 days' + interval '15 hours')
        at time zone 'Asia/Ho_Chi_Minh'
      `,
      status: 'done',
      budgetMax: 120000,
      timeCapSeconds: 1800,
    },
    {
      id: HANGOUT_DONE_2,
      activityType: 'drinks',
      plannedAt: sql`
        (date_trunc('day', (now() at time zone 'Asia/Ho_Chi_Minh'))
          - interval '23 days' + interval '20 hours')
        at time zone 'Asia/Ho_Chi_Minh'
      `,
      status: 'done',
      budgetMax: 400000,
      timeCapSeconds: 2700,
    },
  ];

  for (const hangout of hangouts) {
    await sql`
      insert into hangouts (
        id, group_id, created_by, activity_type, planned_at,
        fairness_mode, budget_max, time_cap_seconds, status, idempotency_key
      )
      values (
        ${hangout.id}, ${GROUP_ID}, ${ownerId}, ${hangout.activityType}, ${hangout.plannedAt},
        'balanced', ${hangout.budgetMax}, ${hangout.timeCapSeconds}, ${hangout.status}, ${hangout.id}
      )
      on conflict (id) do update
        set planned_at = excluded.planned_at,
            status = excluded.status,
            budget_max = excluded.budget_max,
            time_cap_seconds = excluded.time_cap_seconds
    `;
  }

  const people = [
    { userId: ownerId, ...OWNER },
    ...FRIENDS.map((friend) => ({ userId: friendIds[friend.key], ...friend })),
  ];

  for (const hangout of hangouts) {
    for (const person of people) {
      await sql`
        insert into participants (
          hangout_id, user_id, display_name, origin, origin_address, travel_mode, weight
        )
        values (
          ${hangout.id}, ${person.userId}, ${person.displayName},
          ${point(person.lng, person.lat)}, ${person.address}, ${person.travelMode}, '1.00'
        )
        on conflict (hangout_id, user_id) do update
          set origin = excluded.origin,
              origin_address = excluded.origin_address,
              travel_mode = excluded.travel_mode,
              display_name = excluded.display_name
      `;
    }
  }

  // Hai kèo đã đi xong → sổ công bằng có lịch sử. `chosen_suggestion_id` để
  // null vì suggestions chỉ sinh ra khi app gọi /suggest thật.
  const outings = [
    { id: OUTING_1, hangoutId: HANGOUT_DONE_1, daysAgo: 9 },
    { id: OUTING_2, hangoutId: HANGOUT_DONE_2, daysAgo: 23 },
  ];

  for (const outing of outings) {
    await sql`
      insert into outings (id, hangout_id, decided_by, decided_at, happened_at)
      values (
        ${outing.id}, ${outing.hangoutId}, ${ownerId},
        now() - interval '1 day' * ${outing.daysAgo},
        now() - interval '1 day' * ${outing.daysAgo}
      )
      on conflict (id) do update
        set decided_at = excluded.decided_at, happened_at = excluded.happened_at
    `;
  }

  /**
   * delta > 0 nghĩa là đi xa hơn mức trung bình của kèo đó — người có tổng
   * delta dương sẽ được ưu tiên chọn chỗ gần hơn ở lần sau. Tổng mỗi kèo xấp xỉ
   * 0 vì delta là độ lệch quanh trung bình.
   */
  const ledger = [
    { outingId: OUTING_1, key: 'minh', actual: 2_040, delta: 660 },
    { outingId: OUTING_1, key: 'trang', actual: 1_260, delta: -120 },
    { outingId: OUTING_1, key: 'huy', actual: 1_020, delta: -360 },
    { outingId: OUTING_1, key: 'owner', actual: 1_200, delta: -180 },
    { outingId: OUTING_2, key: 'minh', actual: 1_920, delta: 540 },
    { outingId: OUTING_2, key: 'trang', actual: 1_500, delta: 120 },
    { outingId: OUTING_2, key: 'huy', actual: 900, delta: -480 },
    { outingId: OUTING_2, key: 'owner', actual: 1_140, delta: -180 },
  ];

  for (const entry of ledger) {
    const userId = entry.key === 'owner' ? ownerId : friendIds[entry.key];
    await sql`
      insert into fairness_ledger (
        group_id, user_id, outing_id, actual_duration_seconds, delta_seconds
      )
      values (${GROUP_ID}, ${userId}, ${entry.outingId}, ${entry.actual}, ${entry.delta})
      on conflict (outing_id, user_id) do update
        set actual_duration_seconds = excluded.actual_duration_seconds,
            delta_seconds = excluded.delta_seconds
    `;
  }

  console.log('\nXong.');
  console.log(`  Nhóm      : Hội bạn thân (${GROUP_ID})`);
  console.log(`  Mã mời    : ${INVITE_CODE}`);
  console.log(`  Kèo đang bình chọn: ${HANGOUT_VOTING}`);
  console.log('  Mở app, kéo refresh, rồi bấm "tìm gợi ý" để có danh sách quán thật.');
}

try {
  await (clean ? wipe() : seed());
} finally {
  await sql.end({ timeout: 5 });
}
