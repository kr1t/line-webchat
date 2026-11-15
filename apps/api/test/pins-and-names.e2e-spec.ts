import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Database } from '../src/db/database.module.js';
import { type Admin, lineUsers, tickets } from '../src/db/schema.js';
import { authedInject, createAdmin, createLineClientMock, createTestApp, resetDatabase, sessionCookie } from './utils.js';

const A = 'U' + '1a'.repeat(16);
const B = 'U' + '2b'.repeat(16);
const C = 'U' + '3c'.repeat(16);

describe('Pinned chats and customer names (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let nok: Admin;
  let asNok: ReturnType<typeof authedInject>;
  let asMali: ReturnType<typeof authedInject>;

  const order = async (as: ReturnType<typeof authedInject>, filter = 'all') =>
    (await as({ method: 'GET', url: `/conversations?filter=${filter}` })).json<{ userId: string }[]>().map((c) => c.userId);

  beforeAll(async () => {
    ({ app, db } = await createTestApp(createLineClientMock()));
    ({ admin: nok } = await createAdmin(db, { displayName: 'Nok' }));
    const { admin: mali } = await createAdmin(db, { displayName: 'Mali' });
    asNok = authedInject(app, await sessionCookie(app, nok));
    asMali = authedInject(app, await sessionCookie(app, mali));
  });

  beforeEach(async () => {
    await resetDatabase(db);
    const now = Date.now();
    await db.insert(lineUsers).values([
      { userId: A, displayName: 'Alpha', lastMessageAt: new Date(now - 3000) },
      { userId: B, displayName: 'Bravo', lastMessageAt: new Date(now - 2000) },
      { userId: C, displayName: 'Charlie', lastMessageAt: new Date(now - 1000) },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps a personal pin on top for its owner only', async () => {
    expect(await order(asNok)).toEqual([C, B, A]);
    expect((await asNok({ method: 'POST', url: `/conversations/${A}/pin`, payload: {} })).statusCode).toBe(204);
    expect(await order(asNok)).toEqual([A, C, B]);
    expect(await order(asMali)).toEqual([C, B, A]);
    expect(await order(asNok, 'pinned')).toEqual([A]);
  });

  it('puts a team pin on top for everyone and shows who pinned it', async () => {
    await asNok({ method: 'POST', url: `/conversations/${B}/pin`, payload: { team: true } });
    await asMali({ method: 'POST', url: `/conversations/${A}/pin`, payload: {} });
    expect(await order(asMali)).toEqual([B, A, C]);
    expect(await order(asNok)).toEqual([B, C, A]);
    const detail = await asMali({ method: 'GET', url: `/conversations/${B}` });
    expect(detail.json()).toMatchObject({ pinnedTeam: true, pinnedTeamBy: 'Nok', pinnedByMe: false });

    // Anyone can take a team pin down; a personal pin stays with its owner
    expect((await asMali({ method: 'DELETE', url: `/conversations/${B}/pin?team=true` })).statusCode).toBe(204);
    await asNok({ method: 'DELETE', url: `/conversations/${A}/pin` });
    expect(await order(asMali)).toEqual([A, C, B]);
  });

  it('lets the team rename a customer and keep a note, while the LINE name stays', async () => {
    const res = await asNok({ method: 'PUT', url: `/conversations/${A}/profile`, payload: { alias: '  คุณเอ ร้านกาแฟ ', remark: 'ลูกค้า VIP ติดต่อช่วงบ่าย' } });
    expect(res.json()).toMatchObject({ displayName: 'Alpha', alias: 'คุณเอ ร้านกาแฟ', remark: 'ลูกค้า VIP ติดต่อช่วงบ่าย' });

    const found = await asMali({ method: 'GET', url: `/conversations?q=${encodeURIComponent('ร้านกาแฟ')}` });
    expect(found.json()).toEqual([expect.objectContaining({ userId: A, alias: 'คุณเอ ร้านกาแฟ', displayName: 'Alpha' })]);

    const events = await asNok({ method: 'GET', url: `/conversations/${A}/events` });
    expect(events.json()).toContainEqual(expect.objectContaining({ type: 'renamed', actorName: 'Nok' }));

    const [t] = await db
      .insert(tickets)
      .values({ reporterId: A, title: 'x', description: 'x', severity: 'P4', reportedSeverity: 'P4', responseDueAt: new Date() })
      .returning();
    const list = await asNok({ method: 'GET', url: '/tickets' });
    expect(list.json()).toEqual([expect.objectContaining({ id: t.id, reporter: expect.objectContaining({ alias: 'คุณเอ ร้านกาแฟ', displayName: 'Alpha' }) })]);

    const cleared = await asNok({ method: 'PUT', url: `/conversations/${A}/profile`, payload: { alias: '' } });
    expect(cleared.json()).toMatchObject({ alias: null, remark: 'ลูกค้า VIP ติดต่อช่วงบ่าย' });
  });

  it('rejects empty updates and overly long names', async () => {
    expect((await asNok({ method: 'PUT', url: `/conversations/${A}/profile`, payload: {} })).statusCode).toBe(400);
    expect((await asNok({ method: 'PUT', url: `/conversations/${A}/profile`, payload: { alias: 'x'.repeat(61) } })).statusCode).toBe(400);
  });
});
