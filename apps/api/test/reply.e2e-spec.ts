import { HTTPFetchError } from '@line/bot-sdk';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import type { Database } from '../src/db/database.module.js';
import { lineUsers, messages } from '../src/db/schema.js';
import {
  authedInject,
  createAdmin,
  createLineClientMock,
  createTestApp,
  type LineClientMock,
  resetDatabase,
  sessionCookie,
} from './utils.js';

const USER = 'U' + 'a'.repeat(32);
const OTHER = 'U' + 'b'.repeat(32);

const lineError = (status: number) =>
  new HTTPFetchError(`LINE ${status}`, { status, statusText: '', headers: new Headers(), body: '{}' });

describe('Replying from the inbox (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let inject: ReturnType<typeof authedInject>;
  let line: LineClientMock;

  const send = (payload: unknown, userId = USER) =>
    inject({ method: 'POST', url: `/conversations/${userId}/messages`, payload: payload as object });

  const addIncoming = (opts: { replyToken?: string; expiresInMs?: number } = {}) =>
    db.insert(messages).values({
      userId: USER,
      direction: 'in',
      type: 'text',
      text: 'hi',
      replyToken: opts.replyToken ?? null,
      replyTokenExpiresAt: opts.replyToken ? new Date(Date.now() + (opts.expiresInMs ?? 30_000)) : null,
    });

  beforeAll(async () => {
    line = createLineClientMock();
    ({ app, db } = await createTestApp(line));
    const { admin } = await createAdmin(db, { displayName: 'Agent Nok' });
    inject = authedInject(app, await sessionCookie(app, admin));
  });

  beforeEach(async () => {
    await resetDatabase(db);
    vi.clearAllMocks();
    await db.insert(lineUsers).values([
      { userId: USER, displayName: 'A' },
      { userId: OTHER, displayName: 'B' },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('replies with a fresh reply token and uses each token only once', async () => {
    await addIncoming({ replyToken: 'token-1' });

    const first = await send({ text: '  สวัสดีครับ  ' });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      direction: 'out',
      text: 'สวัสดีครับ',
      status: 'sent',
      error: null,
      sentByName: 'Agent Nok',
    });
    expect(line.replyMessage).toHaveBeenCalledWith({
      replyToken: 'token-1',
      messages: [{ type: 'text', text: 'สวัสดีครับ' }],
    });
    expect(line.pushMessage).not.toHaveBeenCalled();

    await send({ text: 'second' });
    expect(line.replyMessage).toHaveBeenCalledTimes(1);
    expect(line.pushMessage).toHaveBeenCalledTimes(1);

    const delivered = await db.select({ delivery: messages.delivery }).from(messages).where(eq(messages.direction, 'out'));
    expect(delivered.map((m) => m.delivery).sort((a, b) => String(a).localeCompare(String(b)))).toEqual(['push', 'reply']);
  });

  it('pushes when the reply token has expired', async () => {
    await addIncoming({ replyToken: 'old', expiresInMs: -1000 });
    await send({ text: 'hello' });
    expect(line.replyMessage).not.toHaveBeenCalled();
    expect(line.pushMessage).toHaveBeenCalledWith(
      { to: USER, messages: [{ type: 'text', text: 'hello' }] },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });

  it('falls back to push when LINE rejects the reply token', async () => {
    await addIncoming({ replyToken: 'bad' });
    line.replyMessage.mockRejectedValueOnce(lineError(400));
    const res = await send({ text: 'hello' });
    expect(res.json().status).toBe('sent');
    expect(line.pushMessage).toHaveBeenCalledTimes(1);
  });

  it('does not push after an unclear reply failure (it may have been delivered)', async () => {
    await addIncoming({ replyToken: 'token' });
    line.replyMessage.mockRejectedValueOnce(lineError(500));
    const res = await send({ text: 'hello' });
    expect(res.json()).toMatchObject({ status: 'failed', error: 'line_unavailable' });
    expect(line.pushMessage).not.toHaveBeenCalled();
  });

  it('keeps failed messages and retries them with the same retry key', async () => {
    line.pushMessage.mockRejectedValueOnce(lineError(429));
    const failed = (await send({ text: 'hello' })).json();
    expect(failed).toMatchObject({ status: 'failed', error: 'quota_exceeded' });
    const firstKey = line.pushMessage.mock.calls[0][1];

    const retried = await inject({ method: 'POST', url: `/conversations/${USER}/messages/${failed.id}/retry` });
    expect(retried.statusCode).toBe(200);
    expect(retried.json()).toMatchObject({ id: failed.id, status: 'sent', error: null });
    expect(line.pushMessage.mock.calls[1][1]).toBe(firstKey);
  });

  it('reports a bad channel access token clearly', async () => {
    line.pushMessage.mockRejectedValueOnce(lineError(401));
    expect((await send({ text: 'hello' })).json()).toMatchObject({ status: 'failed', error: 'line_auth' });
  });

  it('only retries failed messages of the same user', async () => {
    const sent = (await send({ text: 'ok' })).json();
    const retrySent = await inject({ method: 'POST', url: `/conversations/${USER}/messages/${sent.id}/retry` });
    expect(retrySent.statusCode).toBe(409);

    const otherUser = await inject({ method: 'POST', url: `/conversations/${OTHER}/messages/${sent.id}/retry` });
    expect(otherUser.statusCode).toBe(404);
  });

  it('refuses to message users who blocked the OA', async () => {
    await db.update(lineUsers).set({ isFollowing: false }).where(eq(lineUsers.userId, USER));
    const res = await send({ text: 'hello' });
    expect(res.statusCode).toBe(409);
    expect(await db.select().from(messages)).toHaveLength(0);
    expect(line.pushMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['empty text', { text: '' }],
    ['whitespace only', { text: '   \n ' }],
    ['too long', { text: 'ก'.repeat(5001) }],
    ['unknown fields', { text: 'hi', to: OTHER }],
    ['wrong type', { text: 123 }],
  ])('rejects %s', async (_label, payload) => {
    const res = await send(payload);
    expect(res.statusCode).toBe(400);
    expect(line.pushMessage).not.toHaveBeenCalled();
  });

  it('never exposes reply tokens or retry keys', async () => {
    await addIncoming({ replyToken: 'secret-token' });
    const sent = await send({ text: 'hello' });
    const list = await inject({ method: 'GET', url: `/conversations/${USER}/messages` });
    for (const body of [sent.body, list.body]) {
      expect(body).not.toMatch(/secret-token|retryKey|replyToken/);
    }
  });
});
