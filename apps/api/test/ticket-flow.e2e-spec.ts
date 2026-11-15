import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../src/db/database.module.js';
import { chatStates, conversationEvents, lineUsers, messages, ticketAttachments, ticketMessages, tickets } from '../src/db/schema.js';
import {
  createLineClientMock,
  createTestApp,
  type LineClientMock,
  lineEvents,
  postWebhook,
  resetDatabase,
} from './utils.js';

const CUSTOMER = 'U' + '1'.repeat(32);
const STRANGER = 'U' + '2'.repeat(32);

type Sent = { type: string; text?: string; altText?: string; quickReply?: unknown };

describe('Reporting tickets in the LINE chat (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let line: LineClientMock;
  const customer = lineEvents(CUSTOMER);

  const send = (...events: unknown[]) => postWebhook(app, events);
  const lastReply = (): Sent[] => line.replyMessage.mock.calls.at(-1)?.[0].messages ?? [];
  const lastReplyText = () => lastReply().map((m) => m.text ?? m.altText ?? '').join(' | ');
  const allTickets = () => db.select().from(tickets);

  async function report(severity: string, description: string) {
    await send(customer.postback('a=report'));
    await send(customer.postback(`a=sev&v=${severity}`));
    if (severity === 'P1') await send(customer.postback('a=confirm&v=P1'));
    await send(customer.text(description));
    const [ticket] = await db.select().from(tickets).where(eq(tickets.description, description));
    return ticket;
  }

  beforeAll(async () => {
    line = createLineClientMock();
    ({ app, db } = await createTestApp(line));
  });

  beforeEach(async () => {
    await resetDatabase(db);
    vi.clearAllMocks();
    await db.insert(lineUsers).values([
      { userId: CUSTOMER, displayName: 'Customer', role: 'CUSTOMER' },
      { userId: STRANGER, displayName: 'Stranger' },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('walks a customer from the menu to a new ticket', async () => {
    await send(customer.postback('a=report'));
    expect(lastReply().map((m) => m.type)).toEqual(['text', 'flex']);

    await send(customer.postback('a=sev&v=P2'));
    expect(lastReplyText()).toContain('พิมพ์อธิบายปัญหา');

    await send(customer.text('login ไม่ได้ทั้งบริษัท\nขึ้น error 500 หลังกดเข้าสู่ระบบ'));
    expect(lastReplyText()).toContain('TK-000001');

    const [ticket] = await allTickets();
    expect(ticket).toMatchObject({
      number: 1,
      title: 'login ไม่ได้ทั้งบริษัท',
      severity: 'P2',
      reportedSeverity: 'P2',
      status: 'open',
      reporterId: CUSTOMER,
    });
    expect(ticket.responseDueAt.getTime() - ticket.createdAt.getTime()).toBe(60 * 60_000);
    // Still listening for screenshots and details for this ticket
    expect(await db.select().from(chatStates)).toEqual([expect.objectContaining({ step: 'await_more_info', ticketId: ticket.id })]);

    const events = await db.select().from(conversationEvents).where(eq(conversationEvents.userId, CUSTOMER));
    expect(events).toEqual([expect.objectContaining({ type: 'ticket_created', data: expect.objectContaining({ code: 'TK-000001' }) })]);
  });

  it('asks to confirm P1 before taking the description', async () => {
    await send(customer.postback('a=report'));
    await send(customer.postback('a=sev&v=P1'));
    expect(lastReplyText()).toContain('ยืนยัน');

    await send(customer.text('เว็บล่ม'));
    expect(lastReplyText()).toContain('เลือกระดับจากการ์ด');
    expect(await allTickets()).toEqual([]);

    await send(customer.postback('a=confirm&v=P1'));
    await send(customer.text('เว็บล่มทั้งระบบ'));
    expect((await allTickets())[0]).toMatchObject({ severity: 'P1' });
  });

  it('takes the description as text (stickers are not a description)', async () => {
    await send(customer.postback('a=report'), customer.postback('a=sev&v=P4'));
    await send(customer.sticker());
    expect(lastReplyText()).toContain('รับข้อความกับรูปภาพ');
    expect(await allTickets()).toEqual([]);

    await send(customer.text('ปุ่มหน้าแรกสีเพี้ยน'));
    expect(await allTickets()).toHaveLength(1);
  });

  it('can be cancelled, and old buttons do nothing', async () => {
    await send(customer.postback('a=report'), customer.postback('a=cancel'));
    await send(customer.postback('a=sev&v=P3'));
    expect(lastReplyText()).toContain('ใช้ไม่ได้แล้ว');

    // Without an active step, text is a normal chat message for the team
    line.replyMessage.mockClear();
    await send(customer.text('สวัสดีครับ'));
    expect(line.replyMessage).not.toHaveBeenCalled();
    expect(await allTickets()).toEqual([]);
  });

  it('does not let people without the role report', async () => {
    await send(lineEvents(STRANGER).postback('a=report'));
    expect(lastReplyText()).toContain('ยังแจ้งปัญหาผ่านเมนูไม่ได้');
    expect(await db.select().from(chatStates)).toEqual([]);
  });

  it('ignores a redelivered webhook instead of creating a second ticket', async () => {
    await send(customer.postback('a=report'), customer.postback('a=sev&v=P3'));
    const event = customer.text('รายงานยอดขายไม่ตรง');
    await send(event);
    await send(event);
    expect(await allTickets()).toHaveLength(1);
  });

  it('uses the reply token once, so an admin reply afterwards is pushed', async () => {
    await send(customer.postback('a=report'));
    const stored = await db.select().from(messages).where(eq(messages.userId, CUSTOMER)).orderBy(asc(messages.createdAt));
    expect(stored.filter((m) => m.direction === 'in').every((m) => m.replyToken === null)).toBe(true);
    expect(stored.filter((m) => m.direction === 'out').map((m) => m.text)).toEqual(['ถามระดับความรุนแรง', '[การ์ดเลือกระดับ P1–P5]']);
  });

  it('shows open tickets and looks up a ticket code, but only the customer’s own', async () => {
    const mine = await report('P3', 'ค้นหาสินค้าไม่เจอ');
    await send(customer.postback('a=status'));
    expect(lastReplyText()).toContain('1 เรื่อง');

    await send(customer.text('tk1'));
    expect(lastReplyText()).toContain('TK-000001');

    const other = await db
      .insert(tickets)
      .values({
        reporterId: STRANGER,
        title: 'x',
        description: 'x',
        severity: 'P4',
        reportedSeverity: 'P4',
        responseDueAt: new Date(),
      })
      .returning();
    await send(customer.text(`TK-${other[0].number}`));
    expect(lastReplyText()).toContain('ไม่พบ');

    await send(customer.postback(`a=more&t=${other[0].id}`));
    expect(lastReplyText()).toContain('ใช้ไม่ได้แล้ว');
    expect(mine.status).toBe('open');
  });

  it('adds details to a ticket and restarts the clock when it was waiting on the customer', async () => {
    const ticket = await report('P3', 'อีเมลยืนยันมาช้า');
    await db
      .update(tickets)
      .set({ status: 'waiting_customer', pausedAt: new Date(Date.now() - 60_000) })
      .where(eq(tickets.id, ticket.id));

    await send(customer.postback(`a=more&t=${ticket.id}`));
    await send(customer.text('ช้าประมาณ 30 นาทีครับ'));
    expect(lastReplyText()).toContain('เพิ่มข้อมูลใน TK-000001 แล้ว');

    const [after] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(after.status).toBe('in_progress');
    expect(after.pausedAt).toBeNull();
    expect(after.pausedSeconds).toBeGreaterThanOrEqual(59);
  });

  it('closes on confirmation, asks for a rating once, and collects a comment for low scores', async () => {
    const ticket = await report('P4', 'สะกดผิดหน้า about');
    await db.update(tickets).set({ status: 'resolved', resolvedAt: new Date() }).where(eq(tickets.id, ticket.id));

    await send(customer.postback(`a=done&t=${ticket.id}`));
    expect(lastReplyText()).toContain('พอใจ');
    expect(lastReply()[0].quickReply).toBeDefined();

    await send(customer.postback(`a=rate&t=${ticket.id}&v=2`));
    expect(lastReplyText()).toContain('ตรงไหนที่ควรปรับ');
    await send(customer.text('ใช้เวลานานไปหน่อย'));

    await send(customer.postback(`a=rate&t=${ticket.id}&v=5`));
    expect(lastReplyText()).toContain('ได้รับคะแนน');

    const [after] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(after).toMatchObject({ status: 'closed', rating: 2, ratingComment: 'ใช้เวลานานไปหน่อย' });
  });

  it('reopens a resolved ticket when the customer says it is not fixed', async () => {
    const ticket = await report('P3', 'กราฟไม่ขึ้น');
    await db.update(tickets).set({ status: 'resolved', resolvedAt: new Date() }).where(eq(tickets.id, ticket.id));
    await send(customer.postback(`a=reopen&t=${ticket.id}`));
    const [after] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(after).toMatchObject({ status: 'in_progress', resolvedAt: null });
  });

  it('keeps adding pictures and details to the new ticket until the customer says done', async () => {
    const ticket = await report('P2', 'จ่ายเงินไม่ได้');
    await send(customer.image(), customer.text('เกิดตอนกดปุ่มยืนยัน'), customer.image());
    const notes = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, ticket.id));
    expect(notes.map((n) => n.body)).toContain('เกิดตอนกดปุ่มยืนยัน');
    expect(await db.select().from(ticketAttachments).where(eq(ticketAttachments.ticketId, ticket.id))).toHaveLength(2);

    await send(customer.postback('a=finish'));
    expect(lastReplyText()).toContain('เรียบร้อย');
    expect(await db.select().from(chatStates)).toEqual([]);

    // After "done", chatting goes to the team again
    line.replyMessage.mockClear();
    await send(customer.text('ขอบคุณครับ'));
    expect(line.replyMessage).not.toHaveBeenCalled();
  });

  it('greets people who add the OA as น้องติ๊ก, with buttons for customers', async () => {
    const follow = { ...customer.postback('x'), type: 'follow', follow: { isUnblocked: false } } as Record<string, unknown>;
    delete follow.postback;
    await send(follow);
    const [greeting] = lastReply() as (Sent & { sender?: { name: string } })[];
    expect(greeting.text).toContain('มีอะไรให้น้องติ๊กช่วยเหลือไหม');
    expect(greeting.sender).toEqual({ name: 'น้องติ๊ก' });
    expect(greeting.quickReply).toBeDefined();
  });
});
