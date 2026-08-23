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
