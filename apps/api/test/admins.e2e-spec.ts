import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, sql } from 'drizzle-orm';
import { generate, generateSecret } from 'otplib';
import { encryptSecret } from '../src/auth/crypto.js';
import type { Database } from '../src/db/database.module.js';
import { type Admin, admins } from '../src/db/schema.js';
import { createAdmin, createLineClientMock, createTestApp, sessionCookie, WEB_ORIGIN } from './utils.js';

type Res = Awaited<ReturnType<NestFastifyApplication['inject']>>;

describe('Admin management (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let superAdmin: Admin;
  let secret: string;
  let cookie: string;

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object, withCookie = cookie) =>
    app.inject({ method, url, payload, headers: { origin: WEB_ORIGIN, cookie: withCookie } });

  const login = (username: string, password: string) =>
    app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username, password },
      headers: { origin: WEB_ORIGIN },
    });

  /** Enters a fresh 2FA code and adds the step-up cookie to the session cookie. */
  async function stepUp(offsetSteps = 0) {
    const code = await generate({ secret, epoch: Math.floor(Date.now() / 1000) + offsetSteps * 30 });
    const res = await call('POST', '/auth/step-up', { code });
    const sudo = (res.cookies as { name: string; value: string }[]).find((c) => c.name === 'lc_sudo');
    if (sudo) cookie = `${cookie.split('; lc_sudo=')[0]}; lc_sudo=${sudo.value}`;
    return res;
  }

  beforeAll(async () => {
    ({ app, db } = await createTestApp(createLineClientMock()));
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table login_attempts, audit_logs, recovery_codes, admins cascade`);
    secret = generateSecret();
    ({ admin: superAdmin } = await createAdmin(db, {
      username: 'boss',
      role: 'SUPER_ADMIN',
      totpSecretEnc: encryptSecret(secret, process.env.TOTP_ENC_KEY!),
    }));
    cookie = await sessionCookie(app, superAdmin);
  });

  afterAll(async () => {
    await app.close();
  });

  const createUser = async (username = 'nok'): Promise<Res> => call('POST', '/admins', { username, displayName: 'Nok' });

  it('is only for super admins', async () => {
    const { admin } = await createAdmin(db);
    const regular = await sessionCookie(app, admin);
    expect((await call('GET', '/admins', undefined, regular)).statusCode).toBe(403);
    expect((await call('GET', '/audit-logs', undefined, regular)).statusCode).toBe(403);
    expect((await call('POST', '/admins', { username: 'x12', displayName: 'X' }, regular)).statusCode).toBe(403);
    expect((await call('GET', '/admins')).statusCode).toBe(200);
  });

  it('requires a fresh 2FA code before changes', async () => {
    const blocked = await createUser();
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toEqual({ code: 'step_up_required' });

    expect((await call('POST', '/auth/step-up', { code: '000000' })).statusCode).toBe(401);
    expect((await stepUp()).statusCode).toBe(204);
    expect((await createUser()).statusCode).toBe(201);
  });

  it('creates an admin with a one-time temporary password', async () => {
    await stepUp();
    const res = await createUser('Nok.S');
    expect(res.json().admin).toMatchObject({
      username: 'nok.s',
      role: 'ADMIN',
      mustChangePassword: true,
      totpEnabled: false,
    });
    const { tempPassword } = res.json();
    expect(tempPassword).toMatch(/^[\w-]{20}$/);

    expect((await call('GET', '/admins')).body).not.toContain(tempPassword);
    expect((await login('nok.s', tempPassword)).json()).toEqual({ next: 'change_password' });
    expect((await createUser('nok.s')).statusCode).toBe(409);
  });

  it('cannot create super admins or set unexpected fields', async () => {
    await stepUp();
    const res = await call('POST', '/admins', { username: 'evil', displayName: 'E', role: 'SUPER_ADMIN' });
    expect(res.statusCode).toBe(400);
  });

  it('deactivating an admin ends their session and blocks login', async () => {
    const { admin, password } = await createAdmin(db, { username: 'agent1' });
    const theirCookie = await sessionCookie(app, admin);
    await stepUp();

    const res = await call('PATCH', `/admins/${admin.id}`, { isActive: false });
    expect(res.json()).toMatchObject({ isActive: false });
    expect((await call('GET', '/auth/me', undefined, theirCookie)).statusCode).toBe(401);
    expect((await login('agent1', password)).statusCode).toBe(401);

    expect((await call('PATCH', `/admins/${admin.id}`, { isActive: true })).json()).toMatchObject({ isActive: true });
    expect((await login('agent1', password)).statusCode).toBe(200);
  });

  it('resets a password: old one stops working, the temporary one forces a change', async () => {
    const { admin, password } = await createAdmin(db, { username: 'agent2' });
    await stepUp();
    const res = await call('POST', `/admins/${admin.id}/reset-password`);
    expect(res.statusCode).toBe(200);
    expect((await login('agent2', password)).statusCode).toBe(401);
    expect((await login('agent2', res.json().tempPassword)).json()).toEqual({ next: 'change_password' });
  });

  it('resets 2FA so the admin enrols again', async () => {
    const { admin, password } = await createAdmin(db, { username: 'agent3' });
    await stepUp();
    expect((await call('POST', `/admins/${admin.id}/reset-2fa`)).json()).toMatchObject({ totpEnabled: false });
    expect((await login('agent3', password)).json()).toEqual({ next: 'setup_2fa' });
  });

  it('protects the super admin from lock-out and other super admins from changes', async () => {
    const { admin: other } = await createAdmin(db, { username: 'boss2', role: 'SUPER_ADMIN' });
    await stepUp();
    expect((await call('PATCH', `/admins/${superAdmin.id}`, { isActive: false })).json()).toEqual({
      code: 'cannot_manage_self',
    });
    expect((await call('POST', `/admins/${other.id}/reset-2fa`)).json()).toEqual({
      code: 'cannot_manage_super_admin',
    });
    const [row] = await db.select().from(admins).where(eq(admins.id, superAdmin.id));
    expect(row.isActive).toBe(true);
  });

  it('records actions in the audit log', async () => {
    await stepUp();
    const created = (await createUser('agent4')).json();
    await call('POST', `/admins/${created.admin.id}/reset-2fa`);

    const log = (await call('GET', '/audit-logs')).json();
    expect(log.slice(0, 3).map((e: { action: string }) => e.action)).toEqual([
      'admin.2fa_reset',
      'admin.created',
      'step_up',
    ]);
    expect(log[0]).toMatchObject({ actor: 'boss', target: 'agent4' });
  });

  it('does not accept the step-up of another session after a password reset', async () => {
    await stepUp();
    await db.update(admins).set({ tokenVersion: 1 }).where(eq(admins.id, superAdmin.id));
    // Session and step-up cookies are both bound to the old token version
    expect((await createUser('late')).statusCode).toBe(401);
  });
});
