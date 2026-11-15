import { Readable } from 'node:stream';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import type { Database } from '../src/db/database.module.js';
import { type Admin, lineUsers, ticketAttachments, tickets } from '../src/db/schema.js';
import {
  authedInject,
  createAdmin,
  createLineClientMock,
  createTestApp,
  FAKE_JPEG,
  fakeIdTokens,
  type LineClientMock,
  lineEvents,
  postWebhook,
  resetDatabase,
  sessionCookie,
  WEB_ORIGIN,
} from './utils.js';

const ALICE = 'U' + 'a1'.repeat(16);
const BOB = 'U' + 'b2'.repeat(16);

describe('Ticket pictures (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let line: LineClientMock;
  let admin: Admin;
  const alice = lineEvents(ALICE);

  const send = (...events: unknown[]) => postWebhook(app, events);
  const lastReplyText = () => JSON.stringify(line.replyMessage.mock.calls.at(-1)?.[0].messages ?? []);
  const pictures = (ticketId?: string) =>
    ticketId ? db.select().from(ticketAttachments).where(eq(ticketAttachments.ticketId, ticketId)) : db.select().from(ticketAttachments);

  async function liff(userId: string) {
    fakeIdTokens.set(`token-${userId}`, { userId, displayName: null, pictureUrl: null });
    const res = await app.inject({ method: 'POST', url: '/liff/session', headers: { origin: WEB_ORIGIN }, payload: { idToken: `token-${userId}` } });
    const cookie = (res.cookies as { name: string; value: string }[]).find((c) => c.name === 'lc_liff')!.value;
    return (method: 'GET' | 'POST', url: string, body?: Buffer, type = 'image/jpeg') =>
      app.inject({
        method,
        url,
        payload: body,
        headers: { cookie: `lc_liff=${cookie}`, origin: WEB_ORIGIN, ...(body ? { 'content-type': type } : {}) },
      });
  }

  async function newTicket(reporterId = ALICE) {
    const [t] = await db
      .insert(tickets)
      .values({ reporterId, title: 'x', description: 'x', severity: 'P3', reportedSeverity: 'P3', responseDueAt: new Date() })
      .returning();
    return t;
  }

  beforeAll(async () => {
    line = createLineClientMock();
    ({ app, db } = await createTestApp(line));
    ({ admin } = await createAdmin(db));
  });

  beforeEach(async () => {
    await resetDatabase(db);
    vi.clearAllMocks();
    await db.insert(lineUsers).values([
      { userId: ALICE, displayName: 'Alice', role: 'CUSTOMER' },
      { userId: BOB, displayName: 'Bob', role: 'CUSTOMER' },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('in the LINE chat', () => {
    it('keeps pictures sent before the description and attaches them to the new ticket', async () => {
      await send(alice.postback('a=report'), alice.postback('a=sev&v=P3'));
      line.replyMessage.mockClear();

      // LINE delivers several pictures in one webhook; only the first gets an answer
      await send(alice.image(), alice.image(), alice.image());
      expect(line.replyMessage).toHaveBeenCalledTimes(1);
      expect(lastReplyText()).toContain('ได้รับรูปแล้ว');

      await send(alice.text('หน้าชำระเงินขึ้น error'));
      const [ticket] = await db.select().from(tickets);
      expect(await pictures(ticket.id)).toHaveLength(3);
      expect(lastReplyText()).toContain('3 รูป');
    });

    it('drops draft pictures when the report is cancelled', async () => {
      await send(alice.postback('a=report'), alice.postback('a=sev&v=P4'), alice.image(), alice.postback('a=cancel'));
      expect(await pictures()).toEqual([]);
    });

    it('refuses files that are not real images', async () => {
      line.getMessageContent.mockResolvedValueOnce(Readable.from([Buffer.from('<html><script>alert(1)</script></html>')]));
      await send(alice.postback('a=report'), alice.postback('a=sev&v=P4'), alice.image());
      expect(lastReplyText()).toContain('รับรูปนี้ไม่ได้');
      expect(await pictures()).toEqual([]);
    });

    it('adds pictures to an existing ticket and restarts the clock if it was waiting', async () => {
      const t = await newTicket();
      await db.update(tickets).set({ status: 'waiting_customer', pausedAt: new Date() }).where(eq(tickets.id, t.id));
      await send(alice.postback(`a=more&t=${t.id}`), alice.image(), alice.image());
      expect(await pictures(t.id)).toHaveLength(2);
      expect((await db.select().from(tickets).where(eq(tickets.id, t.id)))[0].status).toBe('in_progress');
      expect(lastReplyText()).toContain('แนบรูปใน');
    });

    it('stores a redelivered picture once', async () => {
      await send(alice.postback('a=report'), alice.postback('a=sev&v=P3'));
      const picture = alice.image();
      await send(picture);
      await send(picture);
      expect(await pictures()).toHaveLength(1);
    });
  });

  describe('from the LIFF page', () => {
    it('uploads pictures one at a time and serves them only to the owner and the team', async () => {
      const t = await newTicket();
      const as = await liff(ALICE);
      const up = await as('POST', `/liff/tickets/${t.id}/attachments`, FAKE_JPEG);
      expect(up.statusCode).toBe(201);
      const { id } = up.json<{ id: string }>();

      const own = await as('GET', `/liff/tickets/${t.id}/attachments/${id}`);
      expect(own.headers['content-type']).toBe('image/jpeg');
      expect(own.headers['cache-control']).toBe('private, max-age=3600');
      expect(own.rawPayload.equals(FAKE_JPEG)).toBe(true);

      const bob = await liff(BOB);
      expect((await bob('GET', `/liff/tickets/${t.id}/attachments/${id}`)).statusCode).toBe(404);
      expect((await bob('POST', `/liff/tickets/${t.id}/attachments`, FAKE_JPEG)).statusCode).toBe(404);

      const asAdmin = authedInject(app, await sessionCookie(app, admin));
      expect((await asAdmin({ method: 'GET', url: `/tickets/${t.id}` })).json()).toMatchObject({ attachments: [{ id, contentType: 'image/jpeg' }] });
      expect((await asAdmin({ method: 'GET', url: `/tickets/${t.id}/attachments/${id}` })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: `/tickets/${t.id}/attachments/${id}` })).statusCode).toBe(401);
    });

    it('rejects disguised files, oversized files and more than ten pictures', async () => {
      const t = await newTicket();
      const as = await liff(ALICE);
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      expect((await as('POST', `/liff/tickets/${t.id}/attachments`, svg, 'image/png')).statusCode).toBe(415);
      expect((await as('POST', `/liff/tickets/${t.id}/attachments`, svg, 'image/svg+xml')).statusCode).toBe(415);

      const huge = Buffer.concat([FAKE_JPEG, Buffer.alloc(5 * 1024 * 1024)]);
      expect((await as('POST', `/liff/tickets/${t.id}/attachments`, huge)).statusCode).toBe(413);

      for (let i = 0; i < 10; i++) expect((await as('POST', `/liff/tickets/${t.id}/attachments`, FAKE_JPEG)).statusCode).toBe(201);
      expect((await as('POST', `/liff/tickets/${t.id}/attachments`, FAKE_JPEG)).json()).toMatchObject({ code: 'too_many_images' });
    });

    it('does not take pictures on closed tickets', async () => {
      const t = await newTicket();
      await db.update(tickets).set({ status: 'closed' }).where(eq(tickets.id, t.id));
      const as = await liff(ALICE);
      expect((await as('POST', `/liff/tickets/${t.id}/attachments`, FAKE_JPEG)).statusCode).toBe(409);
    });
  });
});
