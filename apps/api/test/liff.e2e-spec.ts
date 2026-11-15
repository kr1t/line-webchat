import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import type { Database } from '../src/db/database.module.js';
import { type Admin, chatStates, lineUsers, roleInvites, ticketMessages, tickets } from '../src/db/schema.js';
import {
  authedInject,
  createAdmin,
  createLineClientMock,
  createTestApp,
  fakeIdTokens,
  type LineClientMock,
  lineEvents,
  postWebhook,
  resetDatabase,
  sessionCookie,
  WEB_ORIGIN,
} from './utils.js';

const ALICE = 'U' + '7'.repeat(32);
const BOB = 'U' + '8'.repeat(32);
const LIFF_ID = '1234567890-AbCdEfGh';

describe('LIFF pages and invite links (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let line: LineClientMock;
  let admin: Admin;
  let asAdmin: ReturnType<typeof authedInject>;

  /** Signs in through POST /liff/session and returns a request helper with the LIFF cookie. */
  async function liff(userId: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/liff/session',
      headers: { origin: WEB_ORIGIN },
      payload: { idToken: `token-${userId}` },
    });
    expect(res.statusCode).toBe(200);
    const cookie = (res.cookies as { name: string; value: string }[]).find((c) => c.name === 'lc_liff')!;
    return (method: 'GET' | 'POST', url: string, payload?: object) =>
      app.inject({ method, url, payload, headers: { cookie: `lc_liff=${cookie.value}`, origin: WEB_ORIGIN } });
  }

  async function invite(body: object = {}) {
    const res = await asAdmin({ method: 'POST', url: '/role-invites', payload: body });
    expect(res.statusCode).toBe(201);
    const { id, url } = res.json<{ id: string; url: string }>();
    return { id, url, token: new URL(url).searchParams.get('invite')! };
  }

  beforeAll(async () => {
    line = createLineClientMock();
    ({ app, db } = await createTestApp(line));
    ({ admin } = await createAdmin(db, { displayName: 'Nok' }));
    asAdmin = authedInject(app, await sessionCookie(app, admin, { stepUp: true }));
    for (const userId of [ALICE, BOB]) fakeIdTokens.set(`token-${userId}`, { userId, displayName: userId.slice(0, 5), pictureUrl: null });
  });

  beforeEach(async () => {
    await resetDatabase(db);
    vi.clearAllMocks();
    await db.delete(roleInvites);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('session', () => {
    it('only accepts ID tokens LINE vouches for, from our own origin', async () => {
      const bad = await app.inject({ method: 'POST', url: '/liff/session', headers: { origin: WEB_ORIGIN }, payload: { idToken: 'forged-token' } });
      expect(bad.statusCode).toBe(401);
      const otherSite = await app.inject({ method: 'POST', url: '/liff/session', headers: { origin: 'https://evil.example' }, payload: { idToken: `token-${ALICE}` } });
      expect(otherSite.statusCode).toBe(403);

      const as = await liff(ALICE);
      expect((await as('GET', '/liff/me')).json()).toMatchObject({ userId: ALICE, role: null, pendingApproval: false });
      expect(await db.select().from(lineUsers).where(eq(lineUsers.userId, ALICE))).toHaveLength(1);
    });

    it('keeps customer and admin sessions apart', async () => {
      expect((await app.inject({ method: 'GET', url: '/liff/me' })).json()).toMatchObject({ code: 'liff_session_required' });

      const adminCookie = await sessionCookie(app, admin);
      expect((await app.inject({ method: 'GET', url: '/liff/me', headers: { cookie: adminCookie } })).statusCode).toBe(401);

      const as = await liff(ALICE);
      const sneaky = await as('GET', '/conversations');
      expect(sneaky.statusCode).toBe(401);
    });
  });

  describe('invites', () => {
    it('needs a fresh 2FA code to create, and only stores a hash of the token', async () => {
      const noStepUp = authedInject(app, await sessionCookie(app, admin));
      expect((await noStepUp({ method: 'POST', url: '/role-invites', payload: {} })).statusCode).toBe(403);

      const { url, token } = await invite();
      expect(url).toBe(`https://liff.line.me/${LIFF_ID}/join?invite=${token}`);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const [stored] = await db.select().from(roleInvites);
      expect(stored.tokenHash).not.toContain(token);
      expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('an open invite is used once and then waits for approval', async () => {
      const { id, token } = await invite({ requireApproval: false });
      const [stored] = await db.select().from(roleInvites).where(eq(roleInvites.id, id));
      expect(stored.requireApproval).toBe(true); // forced on without a target user

      const alice = await liff(ALICE);
      expect((await alice('POST', '/liff/invites/redeem', { token })).json()).toEqual({ result: 'pending' });
      expect((await alice('GET', '/liff/me')).json()).toMatchObject({ role: null, pendingApproval: true });

      const bob = await liff(BOB);
      expect((await bob('POST', '/liff/invites/redeem', { token })).json()).toEqual({ result: 'used' });

      const approved = await asAdmin({ method: 'POST', url: `/role-invites/${id}/approve` });
      expect(approved.json()).toMatchObject({ role: 'CUSTOMER', richMenu: 'linked' });
      expect(line.linkRichMenuIdToUser).toHaveBeenCalledWith(ALICE, expect.any(String));

      const list = await asAdmin({ method: 'GET', url: '/role-invites' });
      expect(list.json()).toEqual([expect.objectContaining({ id, status: 'granted', usedByUserId: ALICE })]);
    });

    it('an invite locked to one person grants right away, and nobody else can use it', async () => {
      await db.insert(lineUsers).values({ userId: ALICE, displayName: 'Alice' });
      const { token } = await invite({ targetUserId: ALICE, requireApproval: false });

      const bob = await liff(BOB);
      expect((await bob('POST', '/liff/invites/redeem', { token })).json()).toEqual({ result: 'wrong_user' });

      const alice = await liff(ALICE);
      expect((await alice('POST', '/liff/invites/redeem', { token })).json()).toEqual({ result: 'granted' });
      expect((await alice('GET', '/liff/me')).json()).toMatchObject({ role: 'CUSTOMER' });
      expect((await alice('POST', '/liff/invites/redeem', { token })).json()).toEqual({ result: 'already' });
    });

    it('can push an invitation card into the invited customer’s chat', async () => {
      await db.insert(lineUsers).values({ userId: ALICE, displayName: 'Alice' });
      const res = await asAdmin({ method: 'POST', url: '/role-invites', payload: { targetUserId: ALICE, requireApproval: false, sendToChat: true } });
      expect(res.json()).toMatchObject({ sentToChat: true });
      const { url } = res.json<{ url: string }>();
      const [push] = line.pushMessage.mock.calls;
      expect(push[0].to).toBe(ALICE);
      expect(JSON.stringify(push[0].messages)).toContain(url);
      expect(push[0].messages[0]).toMatchObject({ type: 'flex', sender: { name: 'น้องติ๊ก' } });

      // Without a locked customer there is nobody to send it to
      const open = await asAdmin({ method: 'POST', url: '/role-invites', payload: { sendToChat: true } });
      expect(open.statusCode).toBe(400);
    });

    it('rejects expired, revoked and unknown links, and slows down guessing', async () => {
      const expired = await invite();
      await db.update(roleInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(roleInvites.id, expired.id));
      const revoked = await invite();
      expect((await asAdmin({ method: 'POST', url: `/role-invites/${revoked.id}/revoke` })).statusCode).toBe(204);

      const alice = await liff(ALICE);
      expect((await alice('POST', '/liff/invites/redeem', { token: expired.token })).json()).toEqual({ result: 'expired' });
      expect((await alice('POST', '/liff/invites/redeem', { token: revoked.token })).json()).toEqual({ result: 'revoked' });

      const guess = 'A'.repeat(43);
      for (let i = 0; i < 3; i++) await alice('POST', '/liff/invites/redeem', { token: guess });
      expect((await alice('POST', '/liff/invites/redeem', { token: guess })).json()).toEqual({ result: 'blocked' });

      const fresh = await invite();
      expect((await alice('POST', '/liff/invites/redeem', { token: fresh.token })).json()).toEqual({ result: 'blocked' });
      expect((await alice('POST', '/liff/invites/redeem', { token: 'short' })).statusCode).toBe(400);
    });
  });

  describe('tickets', () => {
    beforeEach(async () => {
      await db.insert(lineUsers).values([
        { userId: ALICE, displayName: 'Alice', role: 'CUSTOMER' },
        { userId: BOB, displayName: 'Bob' },
      ]);
    });

    it('is for customers only', async () => {
      const bob = await liff(BOB);
      expect((await bob('GET', '/liff/tickets')).json()).toMatchObject({ code: 'not_customer' });
    });

    it('creates, shows and follows up on the customer’s own tickets without internal notes', async () => {
      const alice = await liff(ALICE);
      const created = await alice('POST', '/liff/tickets', {
        severity: 'P2',
        category: 'login',
        title: 'login ไม่ได้',
        description: 'กด login แล้วหน้าขาว',
      });
      expect(created.statusCode).toBe(201);
      const { id, code } = created.json<{ id: string; code: string }>();
      expect(code).toMatch(/^TK-\d{6}$/);

      await db.insert(ticketMessages).values({ ticketId: id, authorType: 'admin', authorAdminId: admin.id, body: 'ลับเฉพาะทีม', internal: true });
      const detail = await alice('GET', `/liff/tickets/${id}`);
      expect(JSON.stringify(detail.json())).not.toContain('ลับเฉพาะทีม');

      const more = await alice('POST', `/liff/tickets/${id}/messages`, { body: 'ใช้ Chrome ครับ' });
      expect(more.json<{ messages: { body: string }[] }>().messages.map((m) => m.body)).toContain('ใช้ Chrome ครับ');

      expect((await alice('POST', `/liff/tickets/${id}/confirm-resolved`)).statusCode).toBe(409);
      await db.update(tickets).set({ status: 'resolved' }).where(eq(tickets.id, id));
      expect((await alice('POST', `/liff/tickets/${id}/confirm-resolved`)).json()).toMatchObject({ status: 'closed' });
      expect((await alice('POST', `/liff/tickets/${id}/rate`, { rating: 4, comment: 'เร็วดี' })).json()).toMatchObject({ rating: 4 });
      expect((await alice('POST', `/liff/tickets/${id}/rate`, { rating: 5 })).statusCode).toBe(409);

      const list = await alice('GET', '/liff/tickets');
      expect(list.json()).toMatchObject({ active: [], closed: [expect.objectContaining({ id })] });
    });

    it('offers the form next to the chat flow, and the form takes over a half-finished chat report', async () => {
      await postWebhook(app, [lineEvents(ALICE).postback('a=report')]);
      const sent = JSON.stringify(line.replyMessage.mock.calls.at(-1));
      expect(sent).toContain(`https://liff.line.me/${LIFF_ID}/new`);
      expect(sent).toContain(`https://liff.line.me/${LIFF_ID}/new?severity=P3`);
      expect(await db.select().from(chatStates)).toHaveLength(1);

      const alice = await liff(ALICE);
      const created = await alice('POST', '/liff/tickets', { severity: 'P3', category: 'other', title: 'ค้นหาไม่เจอ', description: 'พิมพ์ชื่อสินค้าแล้วไม่ขึ้น' });
      expect(created.statusCode).toBe(201);
      expect(await db.select().from(chatStates)).toHaveLength(0);
    });

    it('hides other people’s tickets', async () => {
      const [other] = await db
        .insert(tickets)
        .values({ reporterId: BOB, title: 'x', description: 'x', severity: 'P4', reportedSeverity: 'P4', responseDueAt: new Date() })
        .returning();
      const alice = await liff(ALICE);
      expect((await alice('GET', `/liff/tickets/${other.id}`)).statusCode).toBe(404);
      expect((await alice('POST', `/liff/tickets/${other.id}/messages`, { body: 'hi' })).statusCode).toBe(404);
    });
  });
});
