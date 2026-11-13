import { createCipheriv, createDecipheriv, randomBytes, randomInt } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

/** Encrypts small secrets (TOTP seeds) at rest. Output: base64 "iv.tag.ciphertext". */
export function encryptSecret(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(payload: string, keyBase64: string): string {
  const [iv, tag, ciphertext] = payload.split('.').map((part) => Buffer.from(part, 'base64'));
  if (!iv || !tag || !ciphertext) throw new Error('Malformed encrypted secret');
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(keyBase64, 'base64'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes (0/o, 1/l/i)

/** Random code like "k7mp-3xq2-h9tw" (~74 bits). */
export function generateRecoveryCode(): string {
  // randomInt avoids the modulo bias of mapping raw bytes onto the alphabet
  const chars = Array.from({ length: 12 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join('')).join('-');
}

/** Random temporary password for new admins (shown once). */
export function generateTempPassword(): string {
  return randomBytes(15).toString('base64url'); // 20 chars
}
