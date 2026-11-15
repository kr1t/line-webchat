import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import type { Database } from '../src/db/database.module.js';
import { lineUsers, messageMedia, messages } from '../src/db/schema.js';
import {
  authedInject,
  createAdmin,
  createLineClientMock,
  createTestApp,
  FAKE_JPEG,
  type LineClientMock,
  lineContent,
  lineEvents,
  postWebhook,
  resetDatabase,
  sessionCookie,
} from './utils.js';

const USER = 'U' + 'c3'.repeat(16);
const OTHER = 'U' + 'd4'.repeat(16);

describe('Pictures, video and files in the admin chat (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let line: LineClientMock;
  let asAdmin: ReturnType<typeof authedInject>;
  const user = lineEvents(USER);

  const latest = async () => (await db.select().from(messages).where(eq(messages.userId, USER)))[0];
  const media = (messageId: string, userId = USER) => asAdmin({ method: 'GET', url: `/conversations/${userId}/messages/${messageId}/media` });

  beforeAll(async () => {
    line = createLineClientMock();
    ({ app, db } = await createTestApp(line));
    const { admin } = await createAdmin(db);
    asAdmin = authedInject(app, await sessionCookie(app, admin));
  });

  beforeEach(async () => {
    await resetDatabase(db);
    vi.clearAllMocks();
    await db.insert(lineUsers).values([{ userId: USER, displayName: 'C' }, { userId: OTHER, displayName: 'O' }]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('copies a picture from LINE when it arrives and shows it inline', async () => {
    await postWebhook(app, [user.image()]);
    const message = await latest();
    expect(message.payload).toMatchObject({ media: 'stored' });

    const res = await media(message.id);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['content-disposition']).toMatch(/^inline/);
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.rawPayload.equals(FAKE_JPEG)).toBe(true);
  });

  it('plays known video types inline', async () => {
    line.getMessageContentWithHttpInfo.mockResolvedValueOnce(lineContent(Buffer.from('fake mp4'), 'video/mp4'));
    await postWebhook(app, [user.video()]);
    const res = await media((await latest()).id);
    expect(res.headers['content-type']).toBe('video/mp4');
    expect(res.headers['content-disposition']).toMatch(/^inline/);
  });

  it('only lets other files be downloaded, never rendered', async () => {
    line.getMessageContentWithHttpInfo.mockResolvedValueOnce(lineContent(Buffer.from('<script>alert(1)</script>'), 'text/html'));
    await postWebhook(app, [user.file('ใบเสนอราคา.html')]);
    const res = await media((await latest()).id);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain(encodeURIComponent('ใบเสนอราคา.html'));
  });

  it('marks files too big to show in the browser', async () => {
    line.getMessageContentWithHttpInfo.mockResolvedValueOnce(lineContent(Buffer.alloc(10), 'video/mp4', 50 * 1024 * 1024));
    await postWebhook(app, [user.video()]);
    const message = await latest();
    expect(message.payload).toMatchObject({ media: 'too_large' });
    expect(await db.select().from(messageMedia)).toEqual([]);
    expect((await media(message.id)).statusCode).toBe(404);
  });

  it('is only reachable for the right chat and with a session', async () => {
    await postWebhook(app, [user.image()]);
    const { id } = await latest();
    expect((await media(id, OTHER)).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/conversations/${USER}/messages/${id}/media` })).statusCode).toBe(401);
  });

  it('keeps the message when LINE cannot give the content', async () => {
    line.getMessageContentWithHttpInfo.mockRejectedValueOnce(new Error('gone'));
    await postWebhook(app, [user.image()]);
    expect((await latest()).payload).toMatchObject({ media: 'unavailable' });
  });
});
