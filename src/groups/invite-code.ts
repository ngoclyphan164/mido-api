import { createHash, randomInt } from 'node:crypto';

/**
 * Crockford-style base32 without I, L, O and U — codes get read out loud and
 * typed by hand, so the ambiguous glyphs are worth losing.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Eight characters is ~1.1e12 combinations. The design mock shows a 4-character
 * code, which is only ~1e6 — brute-forceable, and it collides against the unique
 * index long before the group table gets big.
 */
export const INVITE_CODE_LENGTH = 8;

export function generateInviteCode(length: number = INVITE_CODE_LENGTH): string {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/** Folds case and the glyphs a person is likely to mistype. */
export function normalizeInviteCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V');
}

/**
 * Only the digest is persisted, so a leaked invite link can be rotated without
 * the database ever holding the secret itself.
 */
export function hashInviteCode(code: string): string {
  return createHash('sha256').update(normalizeInviteCode(code)).digest('hex');
}
