import { describe, expect, it } from 'vitest';

import {
  INVITE_CODE_LENGTH,
  generateInviteCode,
  hashInviteCode,
  normalizeInviteCode,
} from './invite-code';

describe('invite code', () => {
  it('sinh code đúng độ dài và chỉ dùng alphabet không gây nhầm', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = generateInviteCode();
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
    }
  });

  it('normalize gộp các glyph dễ nhập sai', () => {
    expect(normalizeInviteCode(' 8f2k ')).toBe('8F2K');
    expect(normalizeInviteCode('io1l')).toBe('1011');
    expect(normalizeInviteCode('u-v')).toBe('VV');
  });

  it('hash ổn định và không phụ thuộc cách người dùng gõ', () => {
    expect(hashInviteCode('8f2k')).toBe(hashInviteCode(' 8F2K '));
    expect(hashInviteCode('8f2k')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteCode('8F2K')).not.toBe(hashInviteCode('8F2M'));
  });
});
