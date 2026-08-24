import { describe, expect, it, vi } from 'vitest';

import {
  DailyProviderQuota,
  ProviderCircuitBreaker,
  ProviderCircuitOpenError,
  ProviderQuotaExceededError,
} from './provider-resilience';

describe('ProviderCircuitBreaker', () => {
  it('mở circuit sau chuỗi lỗi retryable và thử lại sau timeout', async () => {
    let now = 1_000;
    const breaker = new ProviderCircuitBreaker(2, 500, () => now);
    const failure = new Error('upstream unavailable');
    const operation = vi.fn().mockRejectedValue(failure);

    await expect(breaker.execute(operation, () => true)).rejects.toBe(failure);
    await expect(breaker.execute(operation, () => true)).rejects.toBe(failure);
    await expect(breaker.execute(operation, () => true)).rejects.toBeInstanceOf(
      ProviderCircuitOpenError,
    );
    expect(operation).toHaveBeenCalledTimes(2);

    now += 500;
    operation.mockResolvedValueOnce('recovered');
    await expect(breaker.execute(operation, () => true)).resolves.toBe('recovered');
  });

  it('không tính lỗi request không hợp lệ vào circuit', async () => {
    const breaker = new ProviderCircuitBreaker(1, 500);
    const operation = vi.fn().mockRejectedValue(new Error('bad request'));

    await expect(breaker.execute(operation, () => false)).rejects.toThrow('bad request');
    await expect(breaker.execute(operation, () => false)).rejects.toThrow('bad request');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe('DailyProviderQuota', () => {
  it('chặn vượt budget và reset theo ngày UTC', () => {
    let now = new Date('2026-08-24T10:00:00Z');
    const quota = new DailyProviderQuota('routes-elements', 3, () => now);

    quota.consume(2);
    expect(() => quota.consume(2)).toThrow(ProviderQuotaExceededError);

    now = new Date('2026-08-25T00:00:00Z');
    expect(() => quota.consume(3)).not.toThrow();
  });
});
