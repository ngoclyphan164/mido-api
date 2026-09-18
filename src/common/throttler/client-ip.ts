/**
 * Địa chỉ người gọi theo cách edge của Vercel báo về.
 *
 * `ThrottlerGuard` mặc định lấy `req.ips[0] ?? req.ip`, mà `req.ips` chỉ có giá
 * trị khi Express được bật `trust proxy`. `src/main.ts` cố ý không bật — bật lên
 * sẽ đổi luôn ngữ nghĩa `req.protocol`/`req.secure` cho mọi handler — nên trên
 * Vercel `req.ip` là địa chỉ proxy nội bộ của nền tảng và **mọi người gọi trên
 * thế giới dùng chung một bucket**. Với route công khai như xem trước lời mời,
 * đó là không có rate limit.
 *
 * Cả hai header dưới đây đều bị edge của Vercel ghi đè trên đường vào, nên client
 * không giả mạo được. Ngoài Vercel (chạy local, hoặc nền tảng khác) thì không có
 * header nào và người gọi phải quay về `req.ip`.
 */
export function clientIpFromHeaders(headers: Record<string, unknown>): string | undefined {
  return (
    firstHeaderValue(headers['x-vercel-forwarded-for']) ??
    firstHeaderValue(headers['x-forwarded-for'])
  );
}

/**
 * `x-forwarded-for` là danh sách ngăn cách bằng dấu phẩy, client thật đứng đầu.
 * Node cũng có thể trả mảng khi header xuất hiện nhiều lần.
 */
function firstHeaderValue(raw: unknown): string | undefined {
  const value: unknown = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
  if (typeof value !== 'string') return undefined;

  const first = value.split(',')[0]?.trim();
  return first ? first : undefined;
}
