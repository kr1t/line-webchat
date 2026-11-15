import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import type { Database } from '../src/db/database.module.js';
import { type Admin, lineUsers, tickets } from '../src/db/schema.js';
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

const OPEN = 'U' + 'e5'.repeat(16);
const TAKEN = 'U' + 'f6'.repeat(16);

describe('Admin notifications (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let nok: Admin;
  let mali: Admin;
  let asNok: ReturnType<typeof authedInject>;
  let asMali: ReturnType<typeof authedInject>;

  const feed = async (as: ReturnType<typeof authedInject>, since?: Date) =>
    (await as({ method: 'GET', url: `/notifications${since ? `?since=${since.toISOString()}` : ''}` })).json<
      { type: string; href: string; title: string }[]
    >();
  const types = async (as: ReturnType<typeof authedInject>, since?: Date) => (await feed(as, since)).map((n) => n.type).sort();

  beforeAll(async () => {
    ({ app, db } = await createTestApp(createLineClientMock()));
    ({ admin: nok } = await createAdmin(db, { displayName: 'Nok' }));
    ({ admin: mali } = await createAdmin(db, { displayName: 'Mali' }));
    asNok = authedInject(app, await sessionCookie(app, nok));
    asMali = authedInject(app, await sessionCookie(app, mali));
  });

  beforeEach(async () => {
    await resetDatabase(db);
    await db.insert(lineUsers).values([
      { userId: OPEN, displayName: 'Open', role: 'CUSTOMER' },
      { userId: TAKEN, displayName: 'Taken', status: 'handling', assignedAdminId: mali.id },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('tells everyone about new messages in chats nobody has taken, and the owner about theirs', async () => {
    await postWebhook(app, [lineEvents(OPEN).text('สวัสดี'), lineEvents(TAKEN).text('ยังรออยู่นะ')]);
    const forNok = await feed(asNok);
    expect(forNok.filter((n) => n.type === 'chat_new').map((n) => n.href)).toEqual([`/inbox/${OPEN}`]);
    const forMali = await feed(asMali);
    expect(forMali.filter((n) => n.type === 'chat_new').map((n) => n.href).sort()).toEqual([`/inbox/${OPEN}`, `/inbox/${TAKEN}`].sort());
  });

  it('reports new tickets and customers sending them back', async () => {
    const e = lineEvents(OPEN);
    await postWebhook(app, [e.postback('a=report'), e.postback('a=sev&v=P2'), e.text('จ่ายเงินไม่ได้')]);
    const [ticket] = await db.select().from(tickets);
    expect(await feed(asNok)).toContainEqual(expect.objectContaining({ type: 'ticket_new', href: `/tickets/${ticket.id}` }));

    const before = new Date();
    await db.update(tickets).set({ status: 'resolved', resolvedAt: new Date() }).where(eq(tickets.id, ticket.id));
    await postWebhook(app, [e.postback(`a=reopen&t=${ticket.id}`)]);
    expect(await types(asNok, before)).toContain('ticket_reopened');
  });

  it('tells the receiver, not the sender, about hand-overs and assignments', async () => {
    await asMali({ method: 'POST', url: `/conversations/${TAKEN}/transfer`, payload: { adminId: nok.id } });
    const [t] = await db
      .insert(tickets)
      .values({ reporterId: OPEN, title: 'x', description: 'x', severity: 'P3', reportedSeverity: 'P3', responseDueAt: new Date(Date.now() - 60_000), createdAt: new Date(Date.now() - 60_000) })
      .returning();
    await asMali({ method: 'PATCH', url: `/tickets/${t.id}`, payload: { assigneeId: nok.id } });

    const forNok = await types(asNok);
    expect(forNok).toEqual(expect.arrayContaining(['chat_transferred', 'ticket_assigned']));
    const forMali = await types(asMali);
    expect(forMali).not.toContain('chat_transferred');
    expect(forMali).not.toContain('ticket_assigned');

    // Assigning yourself is not news
    await asNok({ method: 'PATCH', url: `/tickets/${t.id}`, payload: { assigneeId: mali.id } });
    const since = new Date(Date.now() - 2000);
    await asMali({ method: 'PATCH', url: `/tickets/${t.id}`, payload: { assigneeId: mali.id } });
    expect((await feed(asMali, since)).filter((n) => n.type === 'ticket_assigned')).toHaveLength(1);
  });

  it('tells the owner when the customer writes on their ticket', async () => {
    const [t] = await db
      .insert(tickets)
      .values({ reporterId: OPEN, title: 'x', description: 'x', severity: 'P3', reportedSeverity: 'P3', responseDueAt: new Date(), assigneeId: nok.id, createdAt: new Date(Date.now() - 60_000) })
      .returning();
    const e = lineEvents(OPEN);
    await postWebhook(app, [e.postback(`a=more&t=${t.id}`), e.text('ส่งข้อมูลเพิ่มครับ')]);
    expect(await feed(asNok)).toContainEqual(expect.objectContaining({ type: 'ticket_reply', href: `/tickets/${t.id}` }));
    expect((await feed(asMali)).filter((n) => n.type === 'ticket_reply')).toEqual([]);
  });

  it('only returns what happened after "since"', async () => {
    await postWebhook(app, [lineEvents(OPEN).text('เก่า')]);
    expect(await feed(asNok, new Date(Date.now() + 1000))).toEqual([]);
  });
});
