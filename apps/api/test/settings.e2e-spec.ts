import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Database } from '../src/db/database.module.js';
import { lineUsers } from '../src/db/schema.js';
import {
  authedInject,
  createAdmin,
  createLineClientMock,
  createTestApp,
  type LineClientMock,
  lineEvents,
  postWebhook,
  resetDatabase,
  sessionCookie,
} from './utils.js';

const CUSTOMER = 'U' + '4'.repeat(32);
const alwaysClosed = { enabled: true, days: [null, null, null, null, null, null, null], message: 'นอกเวลาครับ ทีมจะตอบ{next}' };

describe('Settings, canned responses and after-hours replies (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let line: LineClientMock;
  let asSuper: ReturnType<typeof authedInject>;
  let asAdmin: ReturnType<typeof authedInject>;

  beforeAll(async () => {
    line = createLineClientMock();
    ({ app, db } = await createTestApp(line));
    const { admin: boss } = await createAdmin(db, { role: 'SUPER_ADMIN' });
    const { admin: agent } = await createAdmin(db);
    asSuper = authedInject(app, await sessionCookie(app, boss));
    asAdmin = authedInject(app, await sessionCookie(app, agent));
  });

  beforeEach(async () => {
    await resetDatabase(db);
    vi.clearAllMocks();
    await db.insert(lineUsers).values({ userId: CUSTOMER, displayName: 'C', role: 'CUSTOMER' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('business hours', () => {
    it('defaults to off and only super admins can change it', async () => {
      expect((await asAdmin({ method: 'GET', url: '/settings/business-hours' })).json()).toMatchObject({ enabled: false });
      expect((await asAdmin({ method: 'PUT', url: '/settings/business-hours', payload: alwaysClosed })).statusCode).toBe(403);
      expect((await asSuper({ method: 'PUT', url: '/settings/business-hours', payload: alwaysClosed })).statusCode).toBe(200);
    });

    it('rejects broken schedules', async () => {
      const bad = { ...alwaysClosed, days: [{ open: '18:00', close: '09:00' }, null, null, null, null, null, null] };
      expect((await asSuper({ method: 'PUT', url: '/settings/business-hours', payload: bad })).statusCode).toBe(400);
      expect((await asSuper({ method: 'PUT', url: '/settings/business-hours', payload: { ...alwaysClosed, days: [] } })).statusCode).toBe(400);
    });

    it('answers normal chat once an hour while the team is away', async () => {
      await asSuper({ method: 'PUT', url: '/settings/business-hours', payload: alwaysClosed });
      const customer = lineEvents(CUSTOMER);

      await postWebhook(app, [customer.text('สวัสดีครับ')]);
      expect(line.replyMessage).toHaveBeenCalledTimes(1);
      expect(line.replyMessage.mock.calls[0][0].messages[0].text).toMatch(/^นอกเวลาครับ ทีมจะตอบ/);

      await postWebhook(app, [customer.text('ยังอยู่ไหม')]);
      expect(line.replyMessage).toHaveBeenCalledTimes(1);
    });

    it('notes on the ticket card that the team is away', async () => {
      await asSuper({ method: 'PUT', url: '/settings/business-hours', payload: alwaysClosed });
      const customer = lineEvents(CUSTOMER);
      await postWebhook(app, [customer.postback('a=report'), customer.postback('a=sev&v=P3'), customer.text('รายงานผิด')]);
      const card = JSON.stringify(line.replyMessage.mock.calls.at(-1)![0].messages);
      expect(card).toContain('นอกเวลาทำการ');
    });
  });

  describe('canned responses', () => {
    it('can be created, used, edited and removed by any admin', async () => {
      const created = await asAdmin({
        method: 'POST',
        url: '/canned-responses',
        payload: { shortcut: 'Thanks', title: 'ขอบคุณ', body: 'ขอบคุณครับคุณ{name}' },
      });
      expect(created.statusCode).toBe(201);
      const { id, shortcut } = created.json<{ id: string; shortcut: string }>();
      expect(shortcut).toBe('thanks');

      await asAdmin({ method: 'POST', url: `/canned-responses/${id}/use` });
      expect((await asAdmin({ method: 'GET', url: '/canned-responses' })).json()).toEqual([
        expect.objectContaining({ id, useCount: 1 }),
      ]);

      const dup = await asAdmin({ method: 'POST', url: '/canned-responses', payload: { shortcut: 'thanks', title: 'x', body: 'y' } });
      expect(dup.statusCode).toBe(409);

      const edited = await asAdmin({
        method: 'PATCH',
        url: `/canned-responses/${id}`,
        payload: { shortcut: 'thanks', title: 'ขอบคุณ', body: 'ขอบคุณมากครับ' },
      });
      expect(edited.json()).toMatchObject({ body: 'ขอบคุณมากครับ' });

      expect((await asAdmin({ method: 'DELETE', url: `/canned-responses/${id}` })).statusCode).toBe(204);
      expect((await asAdmin({ method: 'DELETE', url: `/canned-responses/${id}` })).statusCode).toBe(404);
    });

    it('rejects shortcuts with spaces or symbols', async () => {
      const res = await asAdmin({ method: 'POST', url: '/canned-responses', payload: { shortcut: 'hi there!', title: 'x', body: 'y' } });
      expect(res.statusCode).toBe(400);
    });
  });
});
