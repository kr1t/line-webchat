import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, sql } from 'drizzle-orm';
import { generate } from 'otplib';
import { decryptSecret } from '../src/auth/crypto.js';
import type { Database } from '../src/db/database.module.js';
import { admins, auditLogs, recoveryCodes } from '../src/db/schema.js';
import { createAdmin, createLineClientMock, createTestApp, sessionCookie, WEB_ORIGIN } from './utils.js';

type Res = Awaited<ReturnType<NestFastifyApplication['inject']>>;

function cookiesFrom(res: Res, jar: Record<string, string> = {}) {
  for (const c of res.cookies as { name: string; value: string }[]) {
    if (c.value) jar[c.name] = c.value;
    else delete jar[c.name];
  }
  return jar;
}
const header = (jar: Record<string, string>) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('Auth (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  const key = process.env.TOTP_ENC_KEY!;

  const call = (method: 'GET' | 'POST', url: string, jar: Record<string, string> = {}, payload?: object) =>
    app.inject({ method, url, payload, headers: { origin: WEB_ORIGIN, cookie: header(jar) } });

  const login = async (username: string, password: string) => {
    const res = await call('POST', '/auth/login', {}, { username, password });
    return { res, jar: cookiesFrom(res) };
  };

  /** Enrolls 2FA for an admin who just logged in and returns the TOTP secret. */
  const enroll = async (jar: Record<string, string>) => {
    const setup = await call('POST', '/auth/2fa/setup', jar);
    const secret = setup.json().secret as string;
    const code = await generate({ secret });
    const enabled = await call('POST', '/auth/2fa/enable', jar, { code });
    cookiesFrom(enabled, jar);
    return { secret, enabled, code };
  };

  beforeAll(async () => {
    ({ app, db } = await createTestApp(createLineClientMock()));
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table login_attempts, audit_logs, recovery_codes, admins cascade`);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('protection', () => {
    it('requires a session for the inbox but not for health or the webhook', async () => {
      expect((await call('GET', '/conversations')).statusCode).toBe(401);
      expect((await call('GET', '/auth/me')).statusCode).toBe(401);
      expect((await call('GET', '/health')).statusCode).toBe(200);
      const webhook = await app.inject({ method: 'POST', url: '/line/webhook', payload: {} });
      expect(webhook.statusCode).toBe(401); // signature, not session
    });

    it('rejects state-changing requests from other origins', async () => {
      const { admin } = await createAdmin(db);
      const cookie = await sessionCookie(app, admin);
      const evil = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie, origin: 'https://evil.example' } });
      const none = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
      expect(evil.statusCode).toBe(403);
      expect(none.statusCode).toBe(403);
    });

    it('revokes sessions when the token version changes or the admin is deactivated', async () => {
      const { admin } = await createAdmin(db);
      const jar = { lc_session: (await sessionCookie(app, admin)).split('=')[1] };
      expect((await call('GET', '/auth/me', jar)).statusCode).toBe(200);

      await db.update(admins).set({ tokenVersion: 1 }).where(eq(admins.id, admin.id));
      expect((await call('GET', '/auth/me', jar)).statusCode).toBe(401);

      await db.update(admins).set({ tokenVersion: 0, isActive: false }).where(eq(admins.id, admin.id));
      expect((await call('GET', '/auth/me', jar)).statusCode).toBe(401);
    });

    it('rejects a forged session token', async () => {
      const forged = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.';
      expect((await call('GET', '/auth/me', { lc_session: forged })).statusCode).toBe(401);
    });
  });

  describe('password step', () => {
    it('gives the same answer for an unknown user and a wrong password', async () => {
      const { admin } = await createAdmin(db);
      const wrong = await login(admin.username, 'wrong-password-123');
      const unknown = await login('nobody', 'wrong-password-123');
      expect(wrong.res.statusCode).toBe(401);
      expect(unknown.res.statusCode).toBe(401);
      expect(wrong.res.json()).toEqual(unknown.res.json());
    });

    it('locks the username after 5 failures, even for the right password', async () => {
      const { admin, password } = await createAdmin(db);
      for (let i = 0; i < 5; i++) await login(admin.username, 'wrong-password-123');
      const res = (await login(admin.username, password)).res;
      expect(res.statusCode).toBe(429);
      expect(res.json()).toEqual({ code: 'too_many_attempts' });
    });

    it('is case-insensitive for usernames and rejects expired temporary passwords', async () => {
      const { admin, password } = await createAdmin(db, {
        mustChangePassword: true,
        tempPasswordExpiresAt: new Date(Date.now() - 1000),
      });
      expect((await login(admin.username.toUpperCase(), password)).res.statusCode).toBe(401);

      await db.update(admins).set({ tempPasswordExpiresAt: new Date(Date.now() + 60_000) }).where(eq(admins.id, admin.id));
      expect((await login(admin.username.toUpperCase(), password)).res.json()).toEqual({ next: 'change_password' });
    });
  });

  describe('first login of a new admin', () => {
    it('forces a password change, then 2FA enrolment, then signs in', async () => {
      const { admin, password } = await createAdmin(db, { mustChangePassword: true, totpEnabledAt: null });
      const { res, jar } = await login(admin.username, password);
      expect(res.json()).toEqual({ next: 'change_password' });

      // A pending login is not a session
      expect((await call('GET', '/conversations', jar)).statusCode).toBe(401);
      // ...and cannot skip ahead
      expect((await call('POST', '/auth/2fa/setup', jar)).statusCode).toBe(401);

      expect((await call('POST', '/auth/password', jar, { newPassword: 'short' })).statusCode).toBe(400);
      expect(
        (await call('POST', '/auth/password', jar, { newPassword: `my-${admin.username}-password` })).json(),
      ).toEqual({ code: 'password_contains_username' });
      expect((await call('POST', '/auth/password', jar, { newPassword: password })).json()).toEqual({
        code: 'password_reused',
      });

      const changed = await call('POST', '/auth/password', jar, { newPassword: 'a-brand-new-passphrase' });
      expect(changed.json()).toEqual({ next: 'setup_2fa' });
      cookiesFrom(changed, jar);

      const setup = await call('POST', '/auth/2fa/setup', jar);
      expect(setup.statusCode).toBe(200);
      expect(setup.json().qrDataUrl).toMatch(/^data:image\/png;base64,/);

      // The secret is stored encrypted, never in plain text
      const [row] = await db.select().from(admins).where(eq(admins.id, admin.id));
      expect(row.totpSecretEnc).not.toContain(setup.json().secret);
      expect(decryptSecret(row.totpSecretEnc!, key)).toBe(setup.json().secret);

      expect((await call('POST', '/auth/2fa/enable', jar, { code: '000000' })).statusCode).toBe(401);

      const code = await generate({ secret: setup.json().secret });
      const enabled = await call('POST', '/auth/2fa/enable', jar, { code });
      expect(enabled.statusCode).toBe(200);
      expect(enabled.json().recoveryCodes).toHaveLength(10);
      cookiesFrom(enabled, jar);

      expect(jar.lc_mfa).toBeUndefined();
      expect((await call('GET', '/auth/me', jar)).json()).toMatchObject({ username: admin.username });

      const stored = await db.select().from(recoveryCodes).where(eq(recoveryCodes.adminId, admin.id));
      expect(stored).toHaveLength(10);
      expect(stored.map((r) => r.codeHash)).not.toContain(enabled.json().recoveryCodes[0]);
    });
  });

  describe('second factor for enrolled admins', () => {
    async function enrolledAdmin() {
      const { admin, password } = await createAdmin(db, { totpEnabledAt: null });
      const first = await login(admin.username, password);
      const { secret, enabled, code } = await enroll(first.jar);
      return { admin, password, secret, recoveryCodes: enabled.json().recoveryCodes as string[], usedCode: code };
    }

    it('accepts a fresh code and rejects a replayed one', async () => {
      const { admin, password, secret, usedCode } = await enrolledAdmin();
      const { res, jar } = await login(admin.username, password);
      expect(res.json()).toEqual({ next: 'verify_2fa' });

      expect((await call('POST', '/auth/2fa/verify', jar, { code: usedCode })).statusCode).toBe(401);

      const next = await generate({ secret, epoch: nowSeconds() + 30 });
      const ok = await call('POST', '/auth/2fa/verify', jar, { code: next });
      expect(ok.statusCode).toBe(200);
      cookiesFrom(ok, jar);
      expect((await call('GET', '/conversations', jar)).statusCode).toBe(200);
    });

    it('accepts each recovery code once', async () => {
      const { admin, password, recoveryCodes: codes } = await enrolledAdmin();

      const first = await login(admin.username, password);
      const used = await call('POST', '/auth/2fa/verify', first.jar, { code: codes[0].toUpperCase() });
      expect(used.statusCode).toBe(200);

      const second = await login(admin.username, password);
      expect((await call('POST', '/auth/2fa/verify', second.jar, { code: codes[0] })).statusCode).toBe(401);

      const actions = await db.select({ action: auditLogs.action }).from(auditLogs);
      expect(actions.map((a) => a.action)).toContain('2fa.recovery_code_used');
    });

    it('locks 2FA after 5 wrong codes', async () => {
      const { admin, password } = await enrolledAdmin();
      const { jar } = await login(admin.username, password);
      for (let i = 0; i < 5; i++) await call('POST', '/auth/2fa/verify', jar, { code: '000000' });
      expect((await call('POST', '/auth/2fa/verify', jar, { code: '123456' })).statusCode).toBe(429);
    });

    it('rejects malformed codes before checking them', async () => {
      const { admin, password } = await enrolledAdmin();
      const { jar } = await login(admin.username, password);
      expect((await call('POST', '/auth/2fa/verify', jar, { code: 'abc' })).statusCode).toBe(400);
      expect((await call('POST', '/auth/2fa/verify', jar, { code: '123456', extra: 1 })).statusCode).toBe(400);
    });
  });

  it('logout clears the cookies', async () => {
    const { admin } = await createAdmin(db);
    const cookie = await sessionCookie(app, admin);
    const res = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie, origin: WEB_ORIGIN } });
    expect(res.statusCode).toBe(204);
    const cleared = (res.cookies as { name: string; value: string }[]).find((c) => c.name === 'lc_session');
    expect(cleared?.value).toBe('');
  });
});
