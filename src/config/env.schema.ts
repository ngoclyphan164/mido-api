import { z } from 'zod';

/**
 * Mọi biến môi trường phải khai báo ở đây. App fail-fast lúc boot nếu thiếu,
 * thay vì trả 500 lúc runtime khi đã deploy.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  /**
   * Origin cho CORS, phân tách bằng dấu phẩy. CORS chỉ liên quan tới client chạy
   * trong browser (Expo web, web dashboard) — app native không gửi header `Origin`
   * và bỏ qua response header, nên với app iOS/Android biến này vô nghĩa.
   *
   * Để trống = không client browser nào được phép. Dùng `*` để cho phép mọi origin
   * (chỉ nên dùng ở local). Không bỏ custom scheme kiểu `mido://` vào đây — deep
   * link không phải CORS origin.
   */
  ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  /** Bí mật dùng để chặn các route cron của Vercel. */
  CRON_SECRET: z.string().min(16).optional(),

  // Tên biến giữ nguyên đúng theo Supabase Integration prefix DATABASE.
  // Runtime dùng POSTGRES_URL qua Supavisor transaction pooler.
  DATABASE_POSTGRES_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(10).default(3),
  DATABASE_SUPABASE_URL: z
    .string()
    .url()
    .transform((value) => value.replace(/\/$/, '')),
  // Chỉ tồn tại ở backend. Dùng để xóa auth user qua Supabase Admin API;
  // tuyệt đối không đưa key này vào app Expo hay biến EXPO_PUBLIC_*.
  DATABASE_SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Provider chỉ fail khi thực sự được gọi, để health/auth vẫn boot được ở
  // môi trường chưa bật Google Maps. Budget là hàng rào best-effort trên mỗi
  // Vercel instance; quota cứng vẫn phải cấu hình trong Google Cloud Console.
  GOOGLE_MAPS_API_KEY: z.string().min(20).optional(),
  GOOGLE_MAPS_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(8_000),
  GOOGLE_PLACES_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).default(500),
  GOOGLE_TEXT_SEARCH_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).default(500),
  // Place Details chỉ chạy đúng một lần cho mỗi kèo được chốt, cộng vài lần
  // lấp snapshot cho kèo chốt từ trước khi có bảng `outing_places`.
  GOOGLE_PLACE_DETAILS_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).default(500),
  GOOGLE_ROUTES_DAILY_ELEMENT_LIMIT: z.coerce.number().int().min(1).default(10_000),
  GOOGLE_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(20).default(3),
  GOOGLE_CIRCUIT_RESET_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),

  // Ảnh địa điểm: mỗi place trả về tốn đúng 1 call Place Photo, nên budget này
  // nên đặt xấp xỉ (số lần /suggest mỗi ngày × topN). Client xin nguyên pool 20
  // để tự xoay vòng, nên mặc định phải cao hơn hẳn các budget còn lại.
  GOOGLE_PLACE_PHOTO_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).default(2_000),
  GOOGLE_PLACE_PHOTO_MAX_WIDTH_PX: z.coerce.number().int().min(100).max(4_800).default(800),
  GOOGLE_PLACES_LANGUAGE_CODE: z.string().min(2).max(10).default('vi'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Biến môi trường không hợp lệ:\n${issues}`);
  }

  return parsed.data;
}
