import { createHmac, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { configureApp, createAdapter } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { TokenService } from '../src/auth/token.service.js';
import { DB, type Database } from '../src/db/database.module.js';
import { type Admin, admins } from '../src/db/schema.js';
import { LINE_BLOB_CLIENT, LINE_MESSAGING_CLIENT } from '../src/line/line.constants.js';
import { LINE_ID_TOKEN_VERIFIER, type LineIdentity } from '../src/liff/liff.constants.js';

export interface LineClientMock {
  getProfile: ReturnType<typeof vi.fn>;
  replyMessage: ReturnType<typeof vi.fn>;
  pushMessage: ReturnType<typeof vi.fn>;
  linkRichMenuIdToUser: ReturnType<typeof vi.fn>;
  unlinkRichMenuIdFromUser: ReturnType<typeof vi.fn>;
  getMessageQuota: ReturnType<typeof vi.fn>;
  getMessageQuotaConsumption: ReturnType<typeof vi.fn>;
  createRichMenu: ReturnType<typeof vi.fn>;
  deleteRichMenu: ReturnType<typeof vi.fn>;
  linkRichMenuIdToUsers: ReturnType<typeof vi.fn>;
  setRichMenuImage: ReturnType<typeof vi.fn>;
  getMessageContent: ReturnType<typeof vi.fn>;
  getMessageContentWithHttpInfo: ReturnType<typeof vi.fn>;
}

/** What LINE's content endpoint returns for a downloaded file. */
export function lineContent(data: Buffer, contentType: string, length = data.length) {
  return {
    httpResponse: new Response(null, { headers: { 'content-type': contentType, 'content-length': String(length) } }),
    body: Readable.from([data]),
  };
}

/** Smallest bytes that look like a JPEG to the sniffer. */
export const FAKE_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);

export function createLineClientMock(): LineClientMock {
  return {
    getProfile: vi.fn(async (userId: string) => ({
      userId,
      displayName: `User ${userId.slice(-4)}`,
      pictureUrl: `https://profile.line-scdn.net/${userId}`,
      statusMessage: 'hello',
    })),
    replyMessage: vi.fn(async () => ({ sentMessages: [] })),
    pushMessage: vi.fn(async () => ({ sentMessages: [] })),
    linkRichMenuIdToUser: vi.fn(async () => ({})),
    unlinkRichMenuIdFromUser: vi.fn(async () => ({})),
    getMessageQuota: vi.fn(async () => ({ type: 'limited', value: 200 })),
    getMessageQuotaConsumption: vi.fn(async () => ({ totalUsage: 20 })),
    createRichMenu: vi.fn(async () => ({ richMenuId: `richmenu-${'a'.repeat(32)}` })),
    deleteRichMenu: vi.fn(async () => ({})),
    linkRichMenuIdToUsers: vi.fn(async () => ({})),
    // Lives on the blob client in the SDK; one mock object serves both here
    setRichMenuImage: vi.fn(async () => ({})),
    getMessageContent: vi.fn(async () => Readable.from([FAKE_JPEG])),
    getMessageContentWithHttpInfo: vi.fn(async () => lineContent(FAKE_JPEG, 'image/jpeg')),
  };
}

/** ID tokens the fake LINE verify endpoint accepts, keyed by token. */
export const fakeIdTokens = new Map<string, LineIdentity>();

export async function createTestApp(line: LineClientMock) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LINE_MESSAGING_CLIENT)
    .useValue(line)
    .overrideProvider(LINE_BLOB_CLIENT)
    .useValue(line)
    .overrideProvider(LINE_ID_TOKEN_VERIFIER)
    .useValue(async (token: string) => fakeIdTokens.get(token) ?? null)
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(createAdapter(), { rawBody: true });
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return { app, db: app.get<Database>(DB) };
}

export async function resetDatabase(db: Database) {
  await db.execute(
    sql`truncate table messages, line_users, tickets, role_invites, canned_responses, settings, login_attempts restart identity cascade`,
  );
}

export function sign(body: string, secret = process.env.LINE_CHANNEL_SECRET!) {
  return createHmac('sha256', secret).update(body).digest('base64');
}

export const WEB_ORIGIN = 'http://localhost:3000';

/** Inserts an admin; by default fully enrolled (password set, 2FA on). */
export async function createAdmin(db: Database, overrides: Partial<typeof admins.$inferInsert> = {}) {
  const password = 'correct-horse-battery';
  const [admin] = await db
    .insert(admins)
    .values({
      username: `admin_${randomBytes(4).toString('hex')}`,
      displayName: 'Test Admin',
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
      totpEnabledAt: new Date(),
      ...overrides,
    })
    .returning();
  return { admin, password };
}

export async function sessionCookie(app: NestFastifyApplication, admin: Admin, { stepUp = false } = {}) {
  const tokens = app.get(TokenService);
  const session = `lc_session=${await tokens.sign('session', admin)}`;
  return stepUp ? `${session}; lc_sudo=${await tokens.sign('step-up', admin)}` : session;
}

type InjectOptions = Parameters<NestFastifyApplication['inject']>[0] & object;

/** app.inject with a signed-in admin's cookie and our web origin. */
export function authedInject(app: NestFastifyApplication, cookie: string) {
  return (options: InjectOptions) =>
    app.inject({
      ...options,
      headers: { cookie, origin: WEB_ORIGIN, ...(options as { headers?: Record<string, string> }).headers },
    } as InjectOptions);
}

let eventSeq = 0;

/** Builds LINE webhook events for one user; each gets unique ids like real deliveries. */
export function lineEvents(userId: string) {
  const base = () => {
    eventSeq += 1;
    return {
      mode: 'active',
      timestamp: Date.now(),
      webhookEventId: `evt-${process.pid}-${eventSeq}`,
      deliveryContext: { isRedelivery: false },
      source: { type: 'user', userId },
      replyToken: `reply-${eventSeq}`,
    };
  };
  return {
    text: (text: string) => {
      const b = base();
      return { ...b, type: 'message', message: { id: `msg-${process.pid}-${eventSeq}`, type: 'text', text, quoteToken: 'q' } };
    },
    sticker: () => {
      const b = base();
      return {
        ...b,
        type: 'message',
        message: { id: `msg-${process.pid}-${eventSeq}`, type: 'sticker', packageId: '1', stickerId: '1', stickerResourceType: 'STATIC' },
      };
    },
    postback: (data: string) => ({ ...base(), type: 'postback', postback: { data } }),
    file: (fileName: string) => {
      const b = base();
      return { ...b, type: 'message', message: { id: `file-${process.pid}-${eventSeq}`, type: 'file', fileName, fileSize: 100 } };
    },
    video: () => {
      const b = base();
      return { ...b, type: 'message', message: { id: `vid-${process.pid}-${eventSeq}`, type: 'video', duration: 1000, contentProvider: { type: 'line' } } };
    },
    image: () => {
      const b = base();
      return { ...b, type: 'message', message: { id: `img-${process.pid}-${eventSeq}`, type: 'image', contentProvider: { type: 'line' } } };
    },
  };
}

/** Posts events to the webhook with a valid signature. */
export async function postWebhook(app: NestFastifyApplication, events: unknown[]) {
  const payload = JSON.stringify({ destination: 'Ubot', events });
  const res = await app.inject({
    method: 'POST',
    url: '/line/webhook',
    headers: { 'content-type': 'application/json', 'x-line-signature': sign(payload) },
    payload,
  });
  if (res.statusCode !== 200) throw new Error(`webhook returned ${res.statusCode}: ${res.body}`);
  return res;
}
