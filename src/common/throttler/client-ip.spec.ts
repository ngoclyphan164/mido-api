import { describe, expect, it } from 'vitest';

import { clientIpFromHeaders } from './client-ip';

describe('clientIpFromHeaders', () => {
  it('ưu tiên header của Vercel hơn x-forwarded-for', () => {
    expect(
      clientIpFromHeaders({
        'x-vercel-forwarded-for': '203.0.113.7',
        'x-forwarded-for': '198.51.100.9',
      }),
    ).toBe('203.0.113.7');
  });

  it('lấy phần tử đầu của danh sách ngăn cách bằng dấu phẩy', () => {
    expect(
      clientIpFromHeaders({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' }),
    ).toBe('203.0.113.7');
  });

  it('nhận cả dạng mảng khi header xuất hiện nhiều lần', () => {
    expect(clientIpFromHeaders({ 'x-forwarded-for': ['203.0.113.7', '198.51.100.9'] })).toBe(
      '203.0.113.7',
    );
  });

  it('trả undefined khi không có header nào dùng được, để người gọi quay về req.ip', () => {
    expect(clientIpFromHeaders({})).toBeUndefined();
    expect(clientIpFromHeaders({ 'x-forwarded-for': '' })).toBeUndefined();
    expect(clientIpFromHeaders({ 'x-forwarded-for': '   ,  ' })).toBeUndefined();
    expect(clientIpFromHeaders({ 'x-forwarded-for': 42 })).toBeUndefined();
  });
});
