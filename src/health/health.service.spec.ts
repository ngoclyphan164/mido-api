import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { HealthService } from './health.service';

describe('HealthService', () => {
  const config = { get: () => 'test' } as unknown as ConfigService;

  it('trả về status ok kèm env đọc từ config', () => {
    const snapshot = new HealthService(config).snapshot();

    expect(snapshot.status).toBe('ok');
    expect(snapshot.service).toBe('mido-api');
    expect(snapshot.env).toBe('test');
  });

  it('timestamp là ISO string hợp lệ', () => {
    const { timestamp } = new HealthService(config).snapshot();

    expect(Number.isNaN(Date.parse(timestamp))).toBe(false);
  });
});
