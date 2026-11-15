import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Database } from '../src/db/database.module.js';
import { type Admin, auditLogs, lineUsers, messages, tickets } from '../src/db/schema.js';
import { QuotaService } from '../src/tickets/quota.service.js';
import {
  authedInject,
  createAdmin,
  createLineClientMock,
  createTestApp,
  type LineClientMock,
  resetDatabase,
  sessionCookie,
} from './utils.js';

const A = 'U' + '5'.repeat(32);
const B = 'U' + '6'.repeat(32);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

describe('Dashboard, search and export (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let line: LineClientMock;
  let boss: Admin;
  let asBoss: ReturnType<typeof authedInject>;
  let asAgent: ReturnType<typeof authedInject>;

  beforeAll(async () => {
    line = createLineClientMock();
    ({ app, db } = await createTestApp(line));
    ({ admin: boss } = await createAdmin(db, { role: 'SUPER_ADMIN', displayName: 'Boss' }));
    const { admin: agent } = await createAdmin(db, { displayName: 'Agent' });
    asBoss = authedInject(app, await sessionCookie(app, boss));
    asAgent = authedInject(app, await sessionCookie(app, agent));
  });

  beforeEach(async () => {
    await resetDatabase(db);
    vi.clearAllMocks();
    app.get(QuotaService).reset();
    await db.insert(lineUsers).values([
      { userId: A, displayName: 'สมชาย', role: 'CUSTOMER', status: 'open' },
      { userId: B, displayName: 'Manee', role: 'CUSTOMER', status: 'closed' },
    ]);
    const base = { title: 't', description: 'd', responseDueAt: new Date() };
    await db.insert(tickets).values([
      // answered in time, resolved in time, rated 5, assigned to boss
      {
        ...base,
        reporterId: A,
        title: 'กราฟยอดขายไม่ขึ้น',
        severity: 'P2',
        reportedSeverity: 'P1',
        createdAt: hoursAgo(5),
        responseDueAt: hoursAgo(4),
        resolveDueAt: hoursAgo(-3),
        firstResponseAt: hoursAgo(4.5),
        resolvedAt: hoursAgo(1),
        status: 'closed',
        closedAt: hoursAgo(1),
        rating: 5,
        assigneeId: boss.id,
        category: 'data',
      },
      // unanswered and late
      { ...base, reporterId: A, severity: 'P1', reportedSeverity: 'P1', createdAt: hoursAgo(2), responseDueAt: hoursAgo(1.75) },
      // fresh, still in time
      { ...base, reporterId: B, title: '=cmd|calc', severity: 'P4', reportedSeverity: 'P4', createdAt: hoursAgo(0.1), responseDueAt: hoursAgo(-20) },
      // outside the default 7 day range
      { ...base, reporterId: B, severity: 'P3', reportedSeverity: 'P3', createdAt: hoursAgo(24 * 10), status: 'closed' },
    ]);
    await db.insert(messages).values({ userId: A, direction: 'out', type: 'text', text: 'สวัสดีครับ', sentByAdminId: boss.id });
  });

  afterAll(async () => {
    await app.close();
  });

  it('summarises the last 7 days', async () => {
    const res = await asBoss({ method: 'GET', url: '/dashboard' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cards).toMatchObject({
      newTickets: 3,
      openBySeverity: { P1: 1, P2: 0, P3: 0, P4: 1, P5: 0 },
      breachedNow: 1,
      responseMetPct: 50, // 1 in time, 1 still unanswered after the deadline
      resolveMetPct: 100,
      unclaimedChats: 1,
      downgradedPct: 33.3,
      csat: { average: 5, count: 1, positivePct: 100 },
    });
    expect(body.daily).toHaveLength(8);
    expect(body.byCategory).toEqual(expect.arrayContaining([{ category: 'data', count: 1 }]));
    expect(body.topReporters[0]).toMatchObject({ userId: A, count: 2 });
    expect(body.staff).toEqual(
      expect.arrayContaining([expect.objectContaining({ displayName: 'Boss', messagesSent: 1, responseMetPct: 100, ratingAvg: 5 })]),
    );
  });

  it('hides the staff table from regular admins', async () => {
    const res = await asAgent({ method: 'GET', url: '/dashboard' });
    expect(res.json().staff).toBeNull();
  });

  it('validates the range', async () => {
    const res = await asBoss({ method: 'GET', url: '/dashboard?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z' });
    expect(res.statusCode).toBe(400);
  });

  it('reports the LINE push quota and caches it', async () => {
    const first = await asBoss({ method: 'GET', url: '/dashboard/quota' });
    expect(first.json()).toMatchObject({ type: 'limited', limit: 200, used: 20, remaining: 180 });
    await asBoss({ method: 'GET', url: '/dashboard/quota' });
    expect(line.getMessageQuota).toHaveBeenCalledTimes(1);
  });

  it('searches tickets, people and messages', async () => {
    const res = await asAgent({ method: 'GET', url: `/search?q=${encodeURIComponent('สมชาย')}` });
    expect(res.json().conversations).toEqual([expect.objectContaining({ userId: A })]);

    const byText = await asAgent({ method: 'GET', url: `/search?q=${encodeURIComponent('กราฟ')}` });
    expect(byText.json().tickets).toEqual([expect.objectContaining({ title: 'กราฟยอดขายไม่ขึ้น', code: expect.stringMatching(/^TK-/) })]);

    const inChat = await asAgent({ method: 'GET', url: `/search?q=${encodeURIComponent('สวัสดี')}` });
    expect(inChat.json().messages).toHaveLength(1);

    expect((await asAgent({ method: 'GET', url: '/search?q=' })).statusCode).toBe(400);
  });

  it('exports tickets as CSV for Excel and records who exported', async () => {
    const res = await asBoss({ method: 'GET', url: '/tickets/export.csv?status=all' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="tickets-\d{8}\.csv"/);
    expect(res.body.startsWith('﻿')).toBe(true);
    expect(res.body.split('\r\n').filter(Boolean)).toHaveLength(5);
    expect(res.body).toContain("'=cmd|calc");

    const audit = await db.select().from(auditLogs);
    expect(audit).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'tickets.exported', actorId: boss.id })]));
  });
});
