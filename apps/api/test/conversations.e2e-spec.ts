import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import type { Database } from '../src/db/database.module.js';
import { type Admin, lineUsers } from '../src/db/schema.js';
import {
  authedInject,
  createAdmin,
  createLineClientMock,
  createTestApp,
  lineEvents,
  postWebhook,
  resetDatabase,
  sessionCookie,
} from './utils.js';

const USER = 'U' + 'c'.repeat(32);

describe('Conversation status (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let nok: Admin;
  let mali: Admin;
  let asNok: ReturnType<typeof authedInject>;
  let asMali: ReturnType<typeof authedInject>;

  const state = async () => {
    const [row] = await db.select().from(lineUsers).where(eq(lineUsers.userId, USER));
    return { status: row.status, assignedAdminId: row.assignedAdminId };
  };
  const eventTypes = async () =>
    (await asNok({ method: 'GET', url: `/conversations/${USER}/events` })).json<{ type: string }[]>().map((e) => e.type);

  beforeAll(async () => {
    ({ app, db } = await createTestApp(createLineClientMock()));
    ({ admin: nok } = await createAdmin(db, { displayName: 'Nok' }));
    ({ admin: mali } = await createAdmin(db, { displayName: 'Mali' }));
    asNok = authedInject(app, await sessionCookie(app, nok));
    asMali = authedInject(app, await sessionCookie(app, mali));
  });

  beforeEach(async () => {
    await resetDatabase(db);
    await db.insert(lineUsers).values({ userId: USER, displayName: 'Somchai' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts open, can be claimed, transferred and closed, and logs each step', async () => {
    expect(await state()).toEqual({ status: 'open', assignedAdminId: null });

    expect((await asNok({ method: 'POST', url: `/conversations/${USER}/claim` })).statusCode).toBe(204);
    expect(await state()).toEqual({ status: 'handling', assignedAdminId: nok.id });

    const transfer = await asNok({ method: 'POST', url: `/conversations/${USER}/transfer`, payload: { adminId: mali.id } });
    expect(transfer.statusCode).toBe(204);
    expect(await state()).toEqual({ status: 'handling', assignedAdminId: mali.id });

    expect((await asMali({ method: 'POST', url: `/conversations/${USER}/close` })).statusCode).toBe(204);
    expect(await state()).toEqual({ status: 'closed', assignedAdminId: null });

    expect(await eventTypes()).toEqual(['claimed', 'transferred', 'closed']);
  });

  it('reopens a closed chat when the customer writes again', async () => {
    await asNok({ method: 'POST', url: `/conversations/${USER}/close` });
    await postWebhook(app, [lineEvents(USER).text('ยังอยู่ไหมครับ')]);

    expect(await state()).toEqual({ status: 'open', assignedAdminId: null });
    expect(await eventTypes()).toEqual(['closed', 'reopened']);
  });

  it('assigns the chat to whoever replies first, but keeps an existing owner', async () => {
    await asNok({ method: 'POST', url: `/conversations/${USER}/messages`, payload: { text: 'สวัสดีครับ' } });
    expect(await state()).toEqual({ status: 'handling', assignedAdminId: nok.id });

    await asMali({ method: 'POST', url: `/conversations/${USER}/messages`, payload: { text: 'เสริมนิดนึง' } });
    expect(await state()).toEqual({ status: 'handling', assignedAdminId: nok.id });
  });

  it('filters the list by status and owner and returns counts', async () => {
    await db.insert(lineUsers).values({ userId: 'U' + 'd'.repeat(32), displayName: 'Other' });
    await asNok({ method: 'POST', url: `/conversations/${USER}/claim` });

    const mine = await asNok({ method: 'GET', url: '/conversations?filter=mine' });
    expect(mine.json<{ userId: string; assignedName: string }[]>()).toEqual([
      expect.objectContaining({ userId: USER, assignedName: 'Nok', status: 'handling' }),
    ]);
    expect((await asMali({ method: 'GET', url: '/conversations?filter=mine' })).json()).toEqual([]);

    const counts = await asNok({ method: 'GET', url: '/conversations/counts' });
    expect(counts.json()).toEqual({ open: 1, mine: 1, handling: 1, unread: 0 });
  });

  it('rejects transfers to unknown or inactive admins', async () => {
    const { admin: gone } = await createAdmin(db, { isActive: false });
    for (const adminId of [gone.id, '00000000-0000-4000-8000-000000000000']) {
      const res = await asNok({ method: 'POST', url: `/conversations/${USER}/transfer`, payload: { adminId } });
      expect(res.statusCode).toBe(400);
    }
  });

  it('lists active teammates for hand-over', async () => {
    const res = await asNok({ method: 'GET', url: '/team' });
    expect(res.json<{ displayName: string }[]>().map((a) => a.displayName)).toEqual(expect.arrayContaining(['Mali', 'Nok']));
  });
});
