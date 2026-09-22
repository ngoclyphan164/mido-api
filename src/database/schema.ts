import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Giá trị được truyền ở dạng EWKT, ví dụ `SRID=4326;POINT(106.7 10.77)`.
 * Midpoint dùng lat/lng object riêng; lớp repository chịu trách nhiệm đổi sang EWKT.
 */
const geographyPoint = customType<{ data: string }>({
  dataType: () => 'geography(Point,4326)',
});

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const travelModeEnum = pgEnum('travel_mode', ['two_wheeler', 'drive', 'walk', 'transit']);
export const groupMemberRoleEnum = pgEnum('group_member_role', ['owner', 'admin', 'member']);
export const fairnessModeEnum = pgEnum('fairness_mode', [
  'balanced',
  'fairest',
  'fastest',
  'weighted',
]);
export const hangoutStatusEnum = pgEnum('hangout_status', [
  'draft',
  'voting',
  'decided',
  'done',
  'cancelled',
]);

export const profiles = pgTable(
  'profiles',
  {
    // FK tới auth.users được thêm trong migration. Không khai báo auth.users là
    // Drizzle table để drizzle-kit không cố quản lý schema do Supabase sở hữu.
    id: uuid('id').primaryKey(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    avatarUrl: text('avatar_url'),
    defaultTravelMode: travelModeEnum('default_travel_mode').default('two_wheeler').notNull(),
    ...timestamps,
  },
  (table) => [
    check('profiles_display_name_not_blank', sql`length(trim(${table.displayName})) > 0`),
  ],
).enableRLS();

export const groups = pgTable(
  'groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    // Chỉ lưu SHA-256 của invite code. Link bị lộ có thể rotate mà DB không giữ secret thô.
    inviteCodeHash: varchar('invite_code_hash', { length: 64 }).notNull(),
    inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('groups_invite_code_hash_uidx').on(table.inviteCodeHash),
    index('groups_created_by_idx').on(table.createdBy),
    check('groups_name_not_blank', sql`length(trim(${table.name})) > 0`),
  ],
).enableRLS();

export const groupMembers = pgTable(
  'group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: groupMemberRoleEnum('role').default('member').notNull(),
    weightOverride: numeric('weight_override', { precision: 3, scale: 2 }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('group_members_group_user_uidx').on(table.groupId, table.userId),
    index('group_members_user_idx').on(table.userId),
    check(
      'group_members_weight_override_range',
      sql`${table.weightOverride} is null or ${table.weightOverride} between 0.60 and 1.40`,
    ),
  ],
).enableRLS();

export const savedLocations = pgTable(
  'saved_locations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 80 }).notNull(),
    geog: geographyPoint('geog').notNull(),
    /**
     * Địa chỉ đã resolve tại đúng toạ độ này. Toàn bộ điểm lợi của địa điểm lưu
     * sẵn là điền được cả `participants.origin_address` mà không phải geocode
     * lại — mà `PUT /hangouts/:id/participants/me` cần address mới lưu được.
     */
    address: varchar('address', { length: 512 }),
    ...timestamps,
  },
  (table) => [
    index('saved_locations_user_idx').on(table.userId),
    index('saved_locations_geog_gist_idx').using('gist', table.geog),
    // Lưu hai chỗ cùng tên "Nhà" là UX tệ, và unique index thì miễn phí.
    uniqueIndex('saved_locations_user_label_uidx').on(table.userId, table.label),
    check('saved_locations_label_not_blank', sql`length(trim(${table.label})) > 0`),
    check(
      'saved_locations_address_not_blank',
      sql`${table.address} is null or length(trim(${table.address})) > 0`,
    ),
  ],
).enableRLS();

export const hangouts = pgTable(
  'hangouts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    activityType: varchar('activity_type', { length: 50 }).notNull(),
    plannedAt: timestamp('planned_at', { withTimezone: true }).notNull(),
    fairnessMode: fairnessModeEnum('fairness_mode').default('balanced').notNull(),
    budgetMax: integer('budget_max'),
    timeCapSeconds: integer('time_cap_seconds').default(1800).notNull(),
    status: hangoutStatusEnum('status').default('draft').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('hangouts_creator_idempotency_uidx').on(table.createdBy, table.idempotencyKey),
    index('hangouts_group_idx').on(table.groupId),
    check('hangouts_activity_not_blank', sql`length(trim(${table.activityType})) > 0`),
    check(
      'hangouts_budget_non_negative',
      sql`${table.budgetMax} is null or ${table.budgetMax} >= 0`,
    ),
    check('hangouts_time_cap_range', sql`${table.timeCapSeconds} between 300 and 14400`),
  ],
).enableRLS();

export const participants = pgTable(
  'participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    hangoutId: uuid('hangout_id')
      .notNull()
      .references(() => hangouts.id, { onDelete: 'cascade' }),
    // Guest cũng là Supabase anonymous user nên luôn có auth subject ổn định trong session.
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    origin: geographyPoint('origin').notNull(),
    originAddress: varchar('origin_address', { length: 512 }),
    travelMode: travelModeEnum('travel_mode').default('two_wheeler').notNull(),
    weight: numeric('weight', { precision: 3, scale: 2 }).default('1.00').notNull(),
    isFlexible: boolean('is_flexible').default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('participants_hangout_user_uidx').on(table.hangoutId, table.userId),
    index('participants_origin_gist_idx').using('gist', table.origin),
    check('participants_display_name_not_blank', sql`length(trim(${table.displayName})) > 0`),
    check(
      'participants_origin_address_not_blank',
      sql`${table.originAddress} is null or length(trim(${table.originAddress})) > 0`,
    ),
    check('participants_weight_range', sql`${table.weight} between 0.60 and 1.40`),
  ],
).enableRLS();

/**
 * Google cho phép lưu place ID lâu dài, nhưng không mặc định cho phép cache các
 * field content. Bảng này vì vậy chỉ giữ identity và thời điểm cần refresh ID.
 */
export const providerPlaceRefs = pgTable(
  'provider_place_refs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: varchar('provider', { length: 40 }).notNull(),
    externalPlaceId: varchar('external_place_id', { length: 255 }).notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('provider_place_refs_provider_external_uidx').on(
      table.provider,
      table.externalPlaceId,
    ),
    index('provider_place_refs_refresh_idx').on(table.lastVerifiedAt),
  ],
).enableRLS();

/**
 * Cache POI chỉ dành cho provider có license cho phép lưu content. Constraint
 * chặn Google ở tầng DB để một refactor sau này không vô tình vi phạm policy.
 */
export const placeContentCache = pgTable(
  'place_content_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: varchar('provider', { length: 40 }).notNull(),
    externalPlaceId: varchar('external_place_id', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    geog: geographyPoint('geog').notNull(),
    types: text('types').array().notNull(),
    rating: numeric('rating', { precision: 3, scale: 2 }),
    userRatingCount: integer('user_rating_count'),
    priceLevel: integer('price_level'),
    openingHours: jsonb('opening_hours'),
    attribution: jsonb('attribution'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('place_content_cache_provider_external_uidx').on(
      table.provider,
      table.externalPlaceId,
    ),
    index('place_content_cache_geog_gist_idx').using('gist', table.geog),
    index('place_content_cache_expires_idx').on(table.expiresAt),
    check('place_content_cache_no_google', sql`${table.provider} <> 'google_maps'`),
    check('place_content_cache_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check(
      'place_content_cache_rating_range',
      sql`${table.rating} is null or ${table.rating} between 0 and 5`,
    ),
    check(
      'place_content_cache_rating_count_non_negative',
      sql`${table.userRatingCount} is null or ${table.userRatingCount} >= 0`,
    ),
    check(
      'place_content_cache_price_level_range',
      sql`${table.priceLevel} is null or ${table.priceLevel} between 0 and 4`,
    ),
    check('place_content_cache_expiry_order', sql`${table.expiresAt} > ${table.fetchedAt}`),
  ],
).enableRLS();

/** Route content của Google cũng không được cache; provider khác có thể opt in. */
export const routeMatrixCache = pgTable(
  'route_matrix_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    routeProvider: varchar('route_provider', { length: 40 }).notNull(),
    originCell: varchar('origin_cell', { length: 100 }).notNull(),
    destinationProvider: varchar('destination_provider', { length: 40 }).notNull(),
    destinationExternalId: varchar('destination_external_id', { length: 255 }).notNull(),
    mode: travelModeEnum('mode').notNull(),
    timeBucket: timestamp('time_bucket', { withTimezone: true }).notNull(),
    durationSec: integer('duration_sec').notNull(),
    distanceMeters: integer('distance_meters').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('route_matrix_cache_lookup_uidx').on(
      table.routeProvider,
      table.originCell,
      table.destinationProvider,
      table.destinationExternalId,
      table.mode,
      table.timeBucket,
    ),
    index('route_matrix_cache_expires_idx').on(table.expiresAt),
    check('route_matrix_cache_no_google', sql`${table.routeProvider} <> 'google_maps'`),
    check('route_matrix_cache_duration_positive', sql`${table.durationSec} > 0`),
    check('route_matrix_cache_distance_non_negative', sql`${table.distanceMeters} >= 0`),
    check('route_matrix_cache_expiry_order', sql`${table.expiresAt} > ${table.fetchedAt}`),
  ],
).enableRLS();

/**
 * Option ổn định để client vote. Chỉ tham chiếu provider place ID được phép lưu;
 * không persist name/rating/route duration hay score sinh từ Google content.
 */
export const suggestions = pgTable(
  'suggestions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    hangoutId: uuid('hangout_id')
      .notNull()
      .references(() => hangouts.id, { onDelete: 'cascade' }),
    placeRefId: uuid('place_ref_id')
      .notNull()
      .references(() => providerPlaceRefs.id, { onDelete: 'restrict' }),
    rank: integer('rank').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('suggestions_hangout_place_uidx').on(table.hangoutId, table.placeRefId),
    index('suggestions_hangout_active_idx').on(table.hangoutId, table.isActive),
    // Trần 20 khớp với `SuggestDto.topN`: client xin nguyên pool một lần rồi tự
    // xoay vòng 5 option mỗi lần bấm "tìm lại", nên rank 11..20 là hợp lệ.
    check('suggestions_rank_range', sql`${table.rank} between 1 and 20`),
  ],
).enableRLS();

/**
 * Mỗi thành viên tick đúng một quán cho mỗi kèo.
 *
 * Luật đó nằm ở unique index trên `participant_id` chứ không ở tầng code:
 * participant vốn đã thuộc về đúng một kèo, nên "một pick cho mỗi participant"
 * chính là "một lựa chọn cho mỗi người trong mỗi kèo". Đổi ý là UPDATE hàng cũ
 * chứ không thêm hàng mới.
 *
 * Thay cho bảng `votes` cũ (up/down/veto): xem migration 0013.
 */
export const picks = pgTable(
  'picks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    suggestionId: uuid('suggestion_id')
      .notNull()
      .references(() => suggestions.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('picks_participant_uidx').on(table.participantId),
    index('picks_suggestion_idx').on(table.suggestionId),
  ],
).enableRLS();

/**
 * Quyết định cuối cùng của một kèo. Chỉ giữ suggestion identity, không copy
 * Google place content sang bảng này.
 */
export const outings = pgTable(
  'outings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    hangoutId: uuid('hangout_id')
      .notNull()
      .references(() => hangouts.id, { onDelete: 'cascade' }),
    chosenSuggestionId: uuid('chosen_suggestion_id').references(() => suggestions.id, {
      onDelete: 'set null',
    }),
    // Giữ kết quả chung khi người chốt xóa tài khoản, nhưng bỏ liên kết nhận dạng.
    decidedBy: uuid('decided_by').references(() => profiles.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
    happenedAt: timestamp('happened_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('outings_hangout_uidx').on(table.hangoutId),
    index('outings_chosen_suggestion_idx').on(table.chosenSuggestionId),
  ],
).enableRLS();

/**
 * Snapshot nội dung provider cho từng option của một kèo.
 *
 * ĐÂY LÀ NGOẠI LỆ CÓ CHỦ ĐÍCH, KHÔNG PHẢI SƠ SUẤT. `place_content_cache` và
 * `route_matrix_cache` cấm `google_maps` bằng check constraint vì chúng là cache
 * tạm; bảng này thì ngược lại — nó là bản ghi của một lần lên kèo, giữ vĩnh
 * viễn để xem lại lịch sử và để không ai phải trả tiền `/suggest` lần hai.
 * Chủ sản phẩm đã cân nhắc và chọn như vậy: không TTL, không nằm trong
 * `prune-cache`.
 *
 * Hệ quả cần biết trước khi sửa: cả place content lẫn route duration được giữ
 * quá thời hạn mà điều khoản Google Maps Platform cho phép. Muốn quay về đúng
 * điều khoản thì bỏ bảng này; `external_place_id` là thứ duy nhất chắc chắn
 * được lưu lâu dài.
 *
 * Một hàng cho mỗi suggestion. `/suggest` bị chặn khi kèo đã `decided`/`done`
 * nên hàng của option được chốt không bao giờ bị ghi đè — đó là lý do outing
 * không cần bảng riêng, nó đọc qua `outings.chosen_suggestion_id`.
 *
 * Ảnh KHÔNG lưu URL vĩnh viễn: `photoUri` của Google hết hạn sau ít phút. Lưu
 * resource name (`places/{place}/photos/{photo}`), còn `photo_uri` chỉ là bản
 * dùng lại trong vài phút để mở đi mở lại không tốn thêm request Place Photo.
 */
export const suggestionPlaces = pgTable(
  'suggestion_places',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    suggestionId: uuid('suggestion_id')
      .notNull()
      .references(() => suggestions.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 40 }).notNull(),
    externalPlaceId: varchar('external_place_id', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    formattedAddress: varchar('formatted_address', { length: 512 }),
    geog: geographyPoint('geog').notNull(),
    primaryType: varchar('primary_type', { length: 80 }),
    types: text('types').array().notNull(),
    rating: numeric('rating', { precision: 3, scale: 2 }),
    userRatingCount: integer('user_rating_count'),
    priceLevel: integer('price_level'),
    mapsUri: varchar('maps_uri', { length: 512 }),
    photoNames: text('photo_names').array().notNull(),
    photoUri: varchar('photo_uri', { length: 2048 }),
    photoUriFetchedAt: timestamp('photo_uri_fetched_at', { withTimezone: true }),
    availability: varchar('availability', { length: 16 }).notNull(),
    score: numeric('score', { precision: 8, scale: 4 }),
    scoreBreakdown: jsonb('score_breakdown'),
    /** `{ participantId, name, durationSec, distanceMeters?, mode }[]`. */
    travelTimes: jsonb('travel_times').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('suggestion_places_suggestion_uidx').on(table.suggestionId),
    index('suggestion_places_provider_external_idx').on(table.provider, table.externalPlaceId),
    check('suggestion_places_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check(
      'suggestion_places_rating_range',
      sql`${table.rating} is null or ${table.rating} between 0 and 5`,
    ),
    check(
      'suggestion_places_rating_count_non_negative',
      sql`${table.userRatingCount} is null or ${table.userRatingCount} >= 0`,
    ),
    check(
      'suggestion_places_price_level_range',
      sql`${table.priceLevel} is null or ${table.priceLevel} between 0 and 4`,
    ),
  ],
).enableRLS();

/**
 * Delta dương nghĩa là người này đã đi lâu hơn trung bình nhóm và được ưu tiên
 * gần hơn ở lần sau. Chỉ ghi số liệu thực tế do nhóm xác nhận sau outing.
 */
export const fairnessLedger = pgTable(
  'fairness_ledger',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    outingId: uuid('outing_id')
      .notNull()
      .references(() => outings.id, { onDelete: 'cascade' }),
    actualDurationSeconds: integer('actual_duration_seconds').notNull(),
    deltaSeconds: integer('delta_seconds').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('fairness_ledger_outing_user_uidx').on(table.outingId, table.userId),
    index('fairness_ledger_group_user_idx').on(table.groupId, table.userId),
    check(
      'fairness_ledger_actual_duration_range',
      sql`${table.actualDurationSeconds} between 0 and 86400`,
    ),
    check('fairness_ledger_delta_range', sql`${table.deltaSeconds} between -86400 and 86400`),
  ],
).enableRLS();

export const phaseOneSchema = {
  profiles,
  groups,
  groupMembers,
  savedLocations,
  hangouts,
  participants,
};

export const phaseThreeSchema = {
  providerPlaceRefs,
  placeContentCache,
  routeMatrixCache,
};

export const phaseFiveSchema = {
  suggestions,
  picks,
};

export const phaseSixSchema = {
  outings,
  fairnessLedger,
};
