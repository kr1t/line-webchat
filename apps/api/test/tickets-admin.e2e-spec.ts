import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import type { Database } from '../src/db/database.module.js';
import { type Admin, lineUsers, messages, type Ticket, ticketMessages, tickets } from '../src/db/schema.js';
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

const CUSTOMER = 'U' + '3'.repeat(32);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

describe('Tickets in the CMS (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let line: LineClientMock;
  let nok: Admin;
  let asNok: ReturnType<typeof authedInject>;

  async function ticket(values: Partial<typeof tickets.$inferInsert> = {}): Promise<Ticket> {
    const createdAt = values.createdAt ?? new Date();
    const [row] = await db
      .insert(tickets)
      .values({
        reporterId: CUSTOMER,
        title: 'ปัญหา',
        description: 'รายละเอียด',
        severity: 'P3',
        reportedSeverity: 'P3',
        responseDueAt: new Date(createdAt.getTime() + 4 * 3600_000),
        resolveDueAt: new Date(createdAt.getTime() + 3 * 86_400_000),
        createdAt,
        ...values,
      })
      .returning();
    return row;
  }
  const reload = async (id: string) => (await db.select().from(tickets).where(eq(tickets.id, id)))[0];

  beforeAll(async () => {
    line = createLineClientMock();
    ({ app, db } = await createTestApp(line));
    ({ admin: nok } = await createAdmin(db, { displayName: 'Nok' }));
    asNok = authedInject(app, await sessionCookie(app, nok));
  });

  beforeEach(async () => {
    await resetDatabase(db);
    vi.clearAllMocks();
    app.get(QuotaService).reset();
    await db.insert(lineUsers).values({ userId: CUSTOMER, displayName: 'Somchai', role: 'CUSTOMER' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('puts the most urgent deadline first and marks late tickets', async () => {
    const later = await ticket({ title: 'later' });
    const late = await ticket({
      title: 'late',
      severity: 'P1',
      reportedSeverity: 'P1',
      createdAt: minutesAgo(30),
      responseDueAt: minutesAgo(15),
    });
    await ticket({ title: 'done', status: 'closed', closedAt: new Date() });

    const res = await asNok({ method: 'GET', url: '/tickets' });
    const list = res.json<{ id: string; code: string; sla: { current: string } }[]>();
    expect(list.map((t) => t.id)).toEqual([late.id, later.id]);
    expect(list[0]).toMatchObject({ code: `TK-${String(late.number).padStart(6, '0')}`, sla: { current: 'breached' } });

    const breached = await asNok({ method: 'GET', url: '/tickets?sla=breached' });
    expect(breached.json<{ id: string }[]>().map((t) => t.id)).toEqual([late.id]);

    const counts = await asNok({ method: 'GET', url: '/tickets/counts' });
    expect(counts.json()).toEqual({ active: 2, unassigned: 2, mine: 0, breached: 1, urgent: 1 });
  });

  it('filters by assignee, severity and text, including ticket codes', async () => {
    const mine = await ticket({ assigneeId: nok.id, title: 'กราฟไม่ขึ้น' });
    const p1 = await ticket({ severity: 'P1', reportedSeverity: 'P1', title: 'ล่ม' });
    const ids = async (url: string) => (await asNok({ method: 'GET', url })).json<{ id: string }[]>().map((t) => t.id);

    expect(await ids('/tickets?assignee=me')).toEqual([mine.id]);
    expect(await ids('/tickets?assignee=unassigned')).toEqual([p1.id]);
    expect(await ids('/tickets?severity=P1')).toEqual([p1.id]);
    expect(await ids(`/tickets?q=${encodeURIComponent('กราฟ')}`)).toEqual([mine.id]);
    expect(await ids(`/tickets?q=TK-${p1.number}`)).toEqual([p1.id]);
  });

  it('replies to the customer on LINE with the ticket code and counts it as the first response', async () => {
    const t = await ticket();
    const res = await asNok({ method: 'POST', url: `/tickets/${t.id}/messages`, payload: { body: 'กำลังตรวจสอบครับ' } });
    expect(res.statusCode).toBe(201);

    expect(line.pushMessage).toHaveBeenCalledWith(
      { to: CUSTOMER, messages: [{ type: 'text', text: `[TK-${String(t.number).padStart(6, '0')}] กำลังตรวจสอบครับ` }] },
      expect.any(String),
    );
    const after = await reload(t.id);
    expect(after).toMatchObject({ status: 'acknowledged', responseBreached: false });
    expect(after.firstResponseAt).not.toBeNull();
    expect(res.json()).toMatchObject({
      status: 'acknowledged',
      messages: expect.arrayContaining([expect.objectContaining({ authorName: 'Nok', status: 'sent', internal: false })]),
    });
  });

  it('keeps internal notes off LINE', async () => {
    const t = await ticket();
    const res = await asNok({ method: 'POST', url: `/tickets/${t.id}/messages`, payload: { body: 'ลองดู log ก่อน', internal: true } });
    expect(res.statusCode).toBe(201);
    expect(line.pushMessage).not.toHaveBeenCalled();
    expect(line.replyMessage).not.toHaveBeenCalled();
    expect((await reload(t.id)).status).toBe('open');
  });

  it('needs a reason to change the level, and moves the deadlines from the report time', async () => {
    const t = await ticket({ createdAt: minutesAgo(10) });
    const noReason = await asNok({ method: 'PATCH', url: `/tickets/${t.id}`, payload: { severity: 'P1' } });
    expect(noReason.statusCode).toBe(400);

    const res = await asNok({
      method: 'PATCH',
      url: `/tickets/${t.id}`,
      payload: { severity: 'P1', severityReason: 'กระทบการชำระเงินทุกคน' },
    });
    expect(res.statusCode).toBe(200);
    const after = await reload(t.id);
    expect(after.severity).toBe('P1');
    expect(after.reportedSeverity).toBe('P3');
    expect(after.responseDueAt.getTime() - after.createdAt.getTime()).toBe(15 * 60_000);
    expect(res.json<{ events: unknown[] }>().events).toContainEqual(
      expect.objectContaining({ type: 'severity', fromValue: 'P3', toValue: 'P1', reason: 'กระทบการชำระเงินทุกคน', actorName: 'Nok' }),
    );
  });

  it('pauses the clock while waiting for the customer and tells them about progress', async () => {
    const t = await ticket({ firstResponseAt: new Date(), status: 'in_progress' });

    await asNok({ method: 'PATCH', url: `/tickets/${t.id}`, payload: { status: 'waiting_customer' } });
    expect((await reload(t.id)).pausedAt).not.toBeNull();

    await db.update(tickets).set({ pausedAt: minutesAgo(5) }).where(eq(tickets.id, t.id));
    await asNok({ method: 'PATCH', url: `/tickets/${t.id}`, payload: { status: 'in_progress' } });
    const resumed = await reload(t.id);
    expect(resumed.pausedAt).toBeNull();
    expect(resumed.pausedSeconds).toBeGreaterThanOrEqual(299);

    line.pushMessage.mockClear();
    await asNok({ method: 'PATCH', url: `/tickets/${t.id}`, payload: { status: 'resolved' } });
    expect(line.pushMessage).toHaveBeenCalledTimes(1);
    expect((await reload(t.id)).resolvedAt).not.toBeNull();

    line.pushMessage.mockClear();
    await asNok({ method: 'PATCH', url: `/tickets/${t.id}`, payload: { status: 'closed' } });
    const pushed = line.pushMessage.mock.calls[0][0].messages as { type: string; quickReply?: unknown }[];
    expect(pushed.map((m) => m.type)).toEqual(['flex', 'text']);
    expect(pushed[1].quickReply).toBeDefined();
  });

  it('stops optional pushes when the monthly quota is used up', async () => {
    line.getMessageQuota.mockResolvedValueOnce({ type: 'limited', value: 200 });
    line.getMessageQuotaConsumption.mockResolvedValueOnce({ totalUsage: 200 });
    const t = await ticket({ firstResponseAt: new Date(), status: 'in_progress' });
    await asNok({ method: 'PATCH', url: `/tickets/${t.id}`, payload: { status: 'resolved' } });
    expect(line.pushMessage).not.toHaveBeenCalled();
    expect((await reload(t.id)).status).toBe('resolved');
  });

  it('assigns tickets to active admins only', async () => {
    const t = await ticket();
    const ok = await asNok({ method: 'PATCH', url: `/tickets/${t.id}`, payload: { assigneeId: nok.id } });
    expect(ok.json()).toMatchObject({ assigneeName: 'Nok' });

    const { admin: gone } = await createAdmin(db, { isActive: false });
    const bad = await asNok({ method: 'PATCH', url: `/tickets/${t.id}`, payload: { assigneeId: gone.id } });
    expect(bad.statusCode).toBe(400);
  });

  it('attaches a chat message from the same customer once', async () => {
    const t = await ticket();
    const [msg] = await db
      .insert(messages)
      .values({ userId: CUSTOMER, direction: 'in', type: 'text', text: 'เพิ่มเติม: เกิดกับ Safari' })
      .returning();
    const first = await asNok({ method: 'POST', url: `/tickets/${t.id}/attach`, payload: { messageId: msg.id } });
    expect(first.statusCode).toBe(200);
    const again = await asNok({ method: 'POST', url: `/tickets/${t.id}/attach`, payload: { messageId: msg.id } });
    expect(again.statusCode).toBe(409);
    const notes = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, t.id));
    expect(notes.map((n) => n.body)).toContain('เพิ่มเติม: เกิดกับ Safari');
  });

  it('returns 404 for unknown tickets and 400 for bad ids', async () => {
    expect((await asNok({ method: 'GET', url: '/tickets/00000000-0000-4000-8000-000000000000' })).statusCode).toBe(404);
    expect((await asNok({ method: 'GET', url: '/tickets/123' })).statusCode).toBe(400);
  });
});
