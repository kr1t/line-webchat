import { createHmac, randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { configureApp, createAdapter } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { TokenService } from '../src/auth/token.service.js';
import { DB, type Database } from '../src/db/database.module.js';
import { type Admin, admins } from '../src/db/schema.js';
import { LINE_MESSAGING_CLIENT } from '../src/line/line.constants.js';

export interface LineClientMock {
  getProfile: ReturnType<typeof vi.fn>;
  replyMessage: ReturnType<typeof vi.fn>;
  pushMessage: ReturnType<typeof vi.fn>;
}

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
  };
}

export async function createTestApp(line: LineClientMock) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LINE_MESSAGING_CLIENT)
    .useValue(line)
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(createAdapter(), { rawBody: true });
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return { app, db: app.get<Database>(DB) };
}

export async function resetDatabase(db: Database) {
  await db.execute(
    sql`truncate table messages, line_users, tickets, role_invites, canned_responses, settings restart identity cascade`,
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

export async function sessionCookie(app: NestFastifyApplication, admin: Admin) {
  const token = await app.get(TokenService).sign('session', admin);
  return `lc_session=${token}`;
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
