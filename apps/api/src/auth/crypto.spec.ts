import { decryptSecret, encryptSecret, generateRecoveryCode } from './crypto.js';

const key = Buffer.alloc(32, 3).toString('base64');

describe('secret encryption', () => {
  it('round-trips and never stores plaintext', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXPJBSWY3DP', key);
    expect(encrypted).not.toContain('JBSWY3DP');
    expect(decryptSecret(encrypted, key)).toBe('JBSWY3DPEHPK3PXPJBSWY3DP');
  });

  it('uses a fresh iv each time', () => {
    expect(encryptSecret('same', key)).not.toBe(encryptSecret('same', key));
  });

  it('fails on tampering or a wrong key', () => {
    const [iv, tag, data] = encryptSecret('secret', key).split('.');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 1;
    expect(() => decryptSecret([iv, tag, flipped.toString('base64')].join('.'), key)).toThrow();
    expect(() => decryptSecret(encryptSecret('secret', key), Buffer.alloc(32, 4).toString('base64'))).toThrow();
  });
});

describe('generateRecoveryCode', () => {
  it('has the expected shape and is random', () => {
    const codes = new Set(Array.from({ length: 50 }, generateRecoveryCode));
    expect(codes.size).toBe(50);
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  });
});
