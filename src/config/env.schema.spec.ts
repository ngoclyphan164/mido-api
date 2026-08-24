import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  const requiredEnv = {
    DATABASE_POSTGRES_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
    DATABASE_SUPABASE_URL: 'https://example.supabase.co',
  };

  it('mặc định ALLOWED_ORIGINS là danh sách rỗng, không phải ["*"]', () => {
    // Regression: default '*' cũ bị transform thành ['*'], rồi package `cors`
    // so sánh chuỗi chính xác nên chặn hết mọi origin — tên biến nói một đằng,
    // hành vi một nẻo.
    expect(validateEnv(requiredEnv).ALLOWED_ORIGINS).toEqual([]);
  });

  it('tách danh sách origin theo dấu phẩy và bỏ khoảng trắng', () => {
    const env = validateEnv({
      ...requiredEnv,
      ALLOWED_ORIGINS: 'http://localhost:8081, https://mido.app ,',
    });

    expect(env.ALLOWED_ORIGINS).toEqual(['http://localhost:8081', 'https://mido.app']);
  });

  it('giữ nguyên "*" để main.ts quy đổi thành origin: true', () => {
    expect(validateEnv({ ...requiredEnv, ALLOWED_ORIGINS: '*' }).ALLOWED_ORIGINS).toEqual(['*']);
  });

  it('PORT dạng chuỗi được coerce về number', () => {
    expect(validateEnv({ ...requiredEnv, PORT: '4000' }).PORT).toBe(4000);
  });

  it('từ chối CRON_SECRET quá ngắn thay vì im lặng chấp nhận', () => {
    expect(() => validateEnv({ ...requiredEnv, CRON_SECRET: 'ngan' })).toThrow(/CRON_SECRET/);
  });

  it('từ chối NODE_ENV không nằm trong enum', () => {
    expect(() => validateEnv({ ...requiredEnv, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('chuẩn hoá DATABASE_SUPABASE_URL để JWKS URL không có hai dấu slash', () => {
    expect(
      validateEnv({
        ...requiredEnv,
        DATABASE_SUPABASE_URL: 'https://example.supabase.co/',
      }).DATABASE_SUPABASE_URL,
    ).toBe('https://example.supabase.co');
  });

  it('bắt buộc có DATABASE_POSTGRES_URL và DATABASE_SUPABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_POSTGRES_URL/);
  });

  it('validate Google key và coerce budget provider', () => {
    expect(() => validateEnv({ ...requiredEnv, GOOGLE_MAPS_API_KEY: 'short' })).toThrow(
      /GOOGLE_MAPS_API_KEY/,
    );
    expect(
      validateEnv({ ...requiredEnv, GOOGLE_ROUTES_DAILY_ELEMENT_LIMIT: '250' })
        .GOOGLE_ROUTES_DAILY_ELEMENT_LIMIT,
    ).toBe(250);
  });

  it('đọc trực tiếp tên biến do Vercel Supabase Integration tạo', () => {
    const env = validateEnv({
      DATABASE_POSTGRES_URL: 'postgresql://postgres:postgres@pooler.example.com:6543/postgres',
      DATABASE_SUPABASE_URL: 'https://vercel-integration.supabase.co/',
    });

    expect(env.DATABASE_POSTGRES_URL).toContain('pooler.example.com:6543');
    expect(env.DATABASE_SUPABASE_URL).toBe('https://vercel-integration.supabase.co');
  });
});
