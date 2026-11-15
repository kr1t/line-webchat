import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import type { Database } from '../src/db/database.module.js';
import { type Admin, auditLogs, lineUsers } from '../src/db/schema.js';
import {
  authedInject,
  createAdmin,
  createLineClientMock,
  createTestApp,
  type LineClientMock,
  resetDatabase,
  sessionCookie,
} from './utils.js';

const USER = 'U' + 'e'.repeat(32);
const RICH_MENU = `richmenu-${'0'.repeat(32)}`;

describe('Customer role from the chat (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let line: LineClientMock;
  let admin: Admin;

  const setRole = async (role: 'CUSTOMER' | null, stepUp = true) =>
    authedInject(app, await sessionCookie(app, admin, { stepUp }))({
      method: 'PUT',
      url: `/conversations/${USER}/role`,
      payload: { role },
    });

  beforeAll(async () => {
    line = createLineClientMock();
    ({ app, db } = await createTestApp(line));
    ({ admin } = await createAdmin(db, { displayName: 'Nok' }));
  });

  beforeEach(async () => {
    await resetDatabase(db);
    vi.clearAllMocks();
    await db.insert(lineUsers).values({ userId: USER, displayName: 'Somchai' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a fresh 2FA code', async () => {
    const res = await setRole('CUSTOMER', false);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'step_up_required' });
  });

  it('grants the role, links the rich menu, and logs it', async () => {
    const res = await setRole('CUSTOMER');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ role: 'CUSTOMER', richMenu: 'linked' });
    expect(line.linkRichMenuIdToUser).toHaveBeenCalledWith(USER, RICH_MENU);

    const [user] = await db.select().from(lineUsers).where(eq(lineUsers.userId, USER));
    expect(user).toMatchObject({ role: 'CUSTOMER', roleGrantedById: admin.id });

    const audit = await db.select().from(auditLogs).where(eq(auditLogs.targetId, USER));
    expect(audit.map((a) => a.action)).toContain('customer.role_granted');
  });

  it('revokes the role and unlinks the rich menu', async () => {
    await setRole('CUSTOMER');
    const res = await setRole(null);
    expect(res.json()).toEqual({ role: null, richMenu: 'unlinked' });
    expect(line.unlinkRichMenuIdFromUser).toHaveBeenCalledWith(USER);

    const events = await authedInject(app, await sessionCookie(app, admin))({ method: 'GET', url: `/conversations/${USER}/events` });
    expect(events.json<{ type: string }[]>().map((e) => e.type)).toEqual(['role_granted', 'role_revoked']);
  });

  it('keeps the role when LINE fails to link the menu', async () => {
    line.linkRichMenuIdToUser.mockRejectedValueOnce(new Error('LINE down'));
    const res = await setRole('CUSTOMER');
    expect(res.json()).toEqual({ role: 'CUSTOMER', richMenu: 'failed' });
  });

  it('rejects unknown roles', async () => {
    const res = await authedInject(app, await sessionCookie(app, admin, { stepUp: true }))({
      method: 'PUT',
      url: `/conversations/${USER}/role`,
      payload: { role: 'ADMIN' },
    });
    expect(res.statusCode).toBe(400);
  });
});
