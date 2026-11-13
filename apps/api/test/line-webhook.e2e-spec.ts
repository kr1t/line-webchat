import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import type { Database } from '../src/db/database.module.js';
import { lineUsers, messages } from '../src/db/schema.js';
import { createLineClientMock, createTestApp, type LineClientMock, resetDatabase, sign } from './utils.js';

const USER_ID = 'U' + 'a'.repeat(32);
let seq = 0;

function messageEvent(message: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  seq += 1;
  return {
    type: 'message',
    mode: 'active',
    timestamp: Date.now(),
    webhookEventId: `evt-${seq}`,
    deliveryContext: { isRedelivery: false },
    source: { type: 'user', userId: USER_ID },
    replyToken: `reply-${seq}`,
    message: { id: `msg-${seq}`, quoteToken: 'q', ...message },
    ...overrides,
  };
}

function simpleEvent(type: 'follow' | 'unfollow') {
  seq += 1;
  return {
    type,
    mode: 'active',
    timestamp: Date.now(),
    webhookEventId: `evt-${seq}`,
    deliveryContext: { isRedelivery: false },
    source: { type: 'user', userId: USER_ID },
    ...(type === 'follow' ? { replyToken: `reply-${seq}`, follow: { isUnblocked: false } } : {}),
  };
}

describe('POST /line/webhook (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let line: LineClientMock;

  const post = (events: unknown[], signature?: string | null) => {
    const payload = JSON.stringify({ destination: 'Ubot', events });
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (signature !== null) headers['x-line-signature'] = signature ?? sign(payload);
    return app.inject({ method: 'POST', url: '/line/webhook', payload, headers });
  };

  beforeAll(async () => {
    line = createLineClientMock();
    ({ app, db } = await createTestApp(line));
  });

  beforeEach(async () => {
    await resetDatabase(db);
    line.getProfile.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('signature', () => {
    it('rejects requests without a signature', async () => {
      const res = await post([messageEvent({ type: 'text', text: 'hi' })], null);
      expect(res.statusCode).toBe(401);
      expect(await db.select().from(messages)).toHaveLength(0);
    });

    it('rejects requests with a wrong signature', async () => {
      const res = await post([messageEvent({ type: 'text', text: 'hi' })], sign('other body'));
      expect(res.statusCode).toBe(401);
      expect(await db.select().from(messages)).toHaveLength(0);
    });

    it('rejects a body signed with another secret', async () => {
      const payload = JSON.stringify({ destination: 'Ubot', events: [] });
      const res = await app.inject({
        method: 'POST',
        url: '/line/webhook',
        payload,
        headers: { 'content-type': 'application/json', 'x-line-signature': sign(payload, 'wrong-secret') },
      });
      expect(res.statusCode).toBe(401);
    });

    it('accepts the empty verify request from LINE console', async () => {
      const res = await post([]);
      expect(res.statusCode).toBe(200);
    });
  });

  it('stores a text message with the sender profile', async () => {
    const res = await post([messageEvent({ type: 'text', text: 'สวัสดีครับ 👋' })]);
    expect(res.statusCode).toBe(200);

    const [user] = await db.select().from(lineUsers);
    expect(user).toMatchObject({
      userId: USER_ID,
      displayName: 'User aaaa',
      isFollowing: true,
      unreadCount: 1,
    });
    expect(user.lastMessageAt).not.toBeNull();

    const [stored] = await db.select().from(messages);
    expect(stored).toMatchObject({ direction: 'in', type: 'text', text: 'สวัสดีครับ 👋', userId: USER_ID });
    expect(stored.replyToken).toMatch(/^reply-/);
    expect(stored.replyTokenExpiresAt!.getTime()).toBeGreaterThan(stored.createdAt.getTime());
  });

  it('ignores redelivered events', async () => {
    const event = messageEvent({ type: 'text', text: 'once' });
    await post([event]);
    await post([{ ...event, deliveryContext: { isRedelivery: true } }]);

    expect(await db.select().from(messages)).toHaveLength(1);
    const [user] = await db.select().from(lineUsers);
    expect(user.unreadCount).toBe(1);
  });

  it('fetches the profile only once while it is fresh', async () => {
    await post([messageEvent({ type: 'text', text: '1' }), messageEvent({ type: 'text', text: '2' })]);
    expect(line.getProfile).toHaveBeenCalledTimes(1);
    const [user] = await db.select().from(lineUsers);
    expect(user.unreadCount).toBe(2);
  });

  it('stores stickers with their ids', async () => {
    await post([messageEvent({ type: 'sticker', packageId: '446', stickerId: '1988', stickerResourceType: 'STATIC' })]);
    const [stored] = await db.select().from(messages);
    expect(stored.type).toBe('sticker');
    expect(stored.payload).toEqual({ packageId: '446', stickerId: '1988', stickerResourceType: 'STATIC' });
  });

  it('keeps the message when the profile cannot be fetched', async () => {
    line.getProfile.mockRejectedValueOnce(new Error('404'));
    const res = await post([messageEvent({ type: 'text', text: 'hi' })]);
    expect(res.statusCode).toBe(200);

    const [user] = await db.select().from(lineUsers);
    expect(user.displayName).toBeNull();
    expect(await db.select().from(messages)).toHaveLength(1);
  });

  it('tracks follow and unfollow', async () => {
    await post([simpleEvent('follow')]);
    let [user] = await db.select().from(lineUsers).where(eq(lineUsers.userId, USER_ID));
    expect(user.isFollowing).toBe(true);
    expect(user.displayName).toBe('User aaaa');

    await post([simpleEvent('unfollow')]);
    [user] = await db.select().from(lineUsers).where(eq(lineUsers.userId, USER_ID));
    expect(user.isFollowing).toBe(false);
    expect(line.getProfile).toHaveBeenCalledTimes(1);
  });

  it('ignores group messages', async () => {
    await post([messageEvent({ type: 'text', text: 'hi' }, { source: { type: 'group', groupId: 'C1', userId: USER_ID } })]);
    expect(await db.select().from(messages)).toHaveLength(0);
  });

  it('rejects a signed body without events', async () => {
    const payload = JSON.stringify({ destination: 'Ubot' });
    const res = await app.inject({
      method: 'POST',
      url: '/line/webhook',
      payload,
      headers: { 'content-type': 'application/json', 'x-line-signature': sign(payload) },
    });
    expect(res.statusCode).toBe(400);
  });
});
