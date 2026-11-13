import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Database } from '../src/db/database.module.js';
import { lineUsers, messages } from '../src/db/schema.js';
import { authedInject, createAdmin, createLineClientMock, createTestApp, resetDatabase, sessionCookie } from './utils.js';

const userA = 'U' + 'a'.repeat(32);
const userB = 'U' + 'b'.repeat(32);
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

describe('Inbox API (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let inject: ReturnType<typeof authedInject>;

  beforeAll(async () => {
    ({ app, db } = await createTestApp(createLineClientMock()));
    const { admin } = await createAdmin(db);
    inject = authedInject(app, await sessionCookie(app, admin));
  });

  beforeEach(async () => {
    await resetDatabase(db);
    await db.insert(lineUsers).values([
      { userId: userA, displayName: 'Somchai 100%', unreadCount: 2, lastMessageAt: at(1) },
      { userId: userB, displayName: 'Manee', unreadCount: 0, lastMessageAt: at(30) },
    ]);
    await db.insert(messages).values([
      { userId: userA, direction: 'in', type: 'text', text: 'first', createdAt: at(10), replyToken: 'secret-token' },
      { userId: userA, direction: 'in', type: 'text', text: 'latest', createdAt: at(1) },
      { userId: userB, direction: 'in', type: 'sticker', payload: { stickerId: '1' }, createdAt: at(30) },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (url: string) => inject({ method: 'GET', url });

  describe('GET /conversations', () => {
    it('lists users by latest activity with their last message', async () => {
      const res = await get('/conversations');
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.map((c: { userId: string }) => c.userId)).toEqual([userA, userB]);
      expect(body[0]).toMatchObject({ displayName: 'Somchai 100%', unreadCount: 2, lastMessage: { text: 'latest' } });
      expect(body[1].lastMessage).toMatchObject({ type: 'sticker' });
    });

    it('filters unread conversations', async () => {
      const body = (await get('/conversations?filter=unread')).json();
      expect(body).toHaveLength(1);
      expect(body[0].userId).toBe(userA);
    });

    it('searches by name and treats wildcards literally', async () => {
      expect((await get('/conversations?q=man')).json()).toHaveLength(1);
      expect((await get('/conversations?q=%25')).json()).toHaveLength(1); // only "Somchai 100%"
      expect((await get('/conversations?q=_')).json()).toHaveLength(0);
    });

    it('rejects unknown query params', async () => {
      expect((await get('/conversations?admin=true')).statusCode).toBe(400);
    });
  });

  describe('GET /conversations/:userId', () => {
    it('returns contact details with stats', async () => {
      const res = await get(`/conversations/${userA}`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ userId: userA, messageCount: 2, isFollowing: true });
    });

    it('validates the user id', async () => {
      expect((await get('/conversations/not-a-line-id')).statusCode).toBe(400);
      expect((await get(`/conversations/U${'c'.repeat(32)}`)).statusCode).toBe(404);
    });
  });

  describe('GET /conversations/:userId/messages', () => {
    it('returns messages oldest first without reply tokens', async () => {
      const res = await get(`/conversations/${userA}/messages`);
      const body = res.json();
      expect(body.hasMore).toBe(false);
      expect(body.messages.map((m: { text: string }) => m.text)).toEqual(['first', 'latest']);
      expect(res.body).not.toContain('secret-token');
      expect(body.messages[0].replyToken).toBeUndefined();
    });

    it('pages back with before and limit', async () => {
      const latestPage = (await get(`/conversations/${userA}/messages?limit=1`)).json();
      expect(latestPage.messages[0].text).toBe('latest');
      expect(latestPage.hasMore).toBe(true);

      const before = encodeURIComponent(latestPage.messages[0].createdAt);
      const olderPage = (await get(`/conversations/${userA}/messages?limit=1&before=${before}`)).json();
      expect(olderPage.messages[0].text).toBe('first');
      expect(olderPage.hasMore).toBe(false);
    });

    it('rejects an out of range limit', async () => {
      expect((await get(`/conversations/${userA}/messages?limit=500`)).statusCode).toBe(400);
    });
  });

  it('POST /conversations/:userId/read resets unread count', async () => {
    const res = await inject({ method: 'POST', url: `/conversations/${userA}/read` });
    expect(res.statusCode).toBe(204);
    const body = (await get('/conversations?filter=unread')).json();
    expect(body).toHaveLength(0);
  });
});
