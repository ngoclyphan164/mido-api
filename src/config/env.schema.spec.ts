import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  it('mặc định ALLOWED_ORIGINS là danh sách rỗng, không phải ["*"]', () => {
    // Regression: default '*' cũ bị transform thành ['*'], rồi package `cors`
    // so sánh chuỗi chính xác nên chặn hết mọi origin — tên biến nói một đằng,
    // hành vi một nẻo.
    expect(validateEnv({}).ALLOWED_ORIGINS).toEqual([]);
  });

  it('tách danh sách origin theo dấu phẩy và bỏ khoảng trắng', () => {
    const env = validateEnv({
      ALLOWED_ORIGINS: 'http://localhost:8081, https://mido.app ,',
    });

    expect(env.ALLOWED_ORIGINS).toEqual(['http://localhost:8081', 'https://mido.app']);
  });

  it('giữ nguyên "*" để main.ts quy đổi thành origin: true', () => {
    expect(validateEnv({ ALLOWED_ORIGINS: '*' }).ALLOWED_ORIGINS).toEqual(['*']);
  });

  it('PORT dạng chuỗi được coerce về number', () => {
    expect(validateEnv({ PORT: '4000' }).PORT).toBe(4000);
  });

  it('từ chối CRON_SECRET quá ngắn thay vì im lặng chấp nhận', () => {
    expect(() => validateEnv({ CRON_SECRET: 'ngan' })).toThrow(/CRON_SECRET/);
  });

  it('từ chối NODE_ENV không nằm trong enum', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
