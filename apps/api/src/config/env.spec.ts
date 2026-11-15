import { validateEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  LINE_CHANNEL_SECRET: 'secret',
  LINE_CHANNEL_ACCESS_TOKEN: 'token',
  JWT_SECRET: 'x'.repeat(32),
  TOTP_ENC_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('lists missing variable names without leaking values', () => {
    expect(() => validateEnv({ LINE_CHANNEL_SECRET: 'super-secret-value' })).toThrow(
      /DATABASE_URL.*LINE_CHANNEL_ACCESS_TOKEN/,
    );
    try {
      validateEnv({ LINE_CHANNEL_SECRET: 'super-secret-value' });
    } catch (error) {
      expect((error as Error).message).not.toContain('super-secret-value');
    }
  });

  it('rejects a short jwt secret and a wrong size encryption key', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...valid, TOTP_ENC_KEY: Buffer.alloc(16).toString('base64') })).toThrow(/TOTP_ENC_KEY/);
  });

  it('rejects non-postgres database urls', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
  });

  it('treats empty optional values as unset and checks their format', () => {
    const env = validateEnv({ ...valid, CUSTOMER_RICH_MENU_ID: '', LIFF_ID: '', LINE_LOGIN_CHANNEL_ID: '' });
    expect(env.CUSTOMER_RICH_MENU_ID).toBeUndefined();
    expect(() => validateEnv({ ...valid, CUSTOMER_RICH_MENU_ID: 'not-a-menu' })).toThrow(/CUSTOMER_RICH_MENU_ID/);
  });
});
