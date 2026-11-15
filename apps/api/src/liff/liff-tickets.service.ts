import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { admins, chatStates, lineUsers, type Ticket, ticketEvents, ticketMessages, tickets } from '../db/schema.js';
import { ACTIVE_STATUSES, durationText, SLA, ticketCode } from '../tickets/sla.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { AttachmentsService } from '../tickets/attachments.service.js';
import type { CreateTicketBody } from './liff.schemas.js';

const summary = (t: Ticket) => ({
  id: t.id,
  code: ticketCode(t.number),
  title: t.title,
  severity: t.severity,
  status: t.status,
  category: t.category,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  rating: t.rating,
  expectedResponse: `ทีมจะตอบกลับภายใน ${durationText(SLA[t.severity].responseMinutes)}`,
});

/** The customer's view of their own tickets. Internal notes and team-only fields never leave here. */
@Injectable()
export class LiffTicketsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tickets: TicketsService,
    private readonly attachments: AttachmentsService,
  ) {}

  async assertCustomer(userId: string) {
    const [user] = await this.db.select({ role: lineUsers.role }).from(lineUsers).where(eq(lineUsers.userId, userId)).limit(1);
    if (user?.role !== 'CUSTOMER') throw new ForbiddenException({ code: 'not_customer' });
  }

  async list(userId: string) {
    await this.assertCustomer(userId);
    const rows = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.reporterId, userId))
      .orderBy(desc(tickets.updatedAt))
      .limit(50);
    return {
      active: rows.filter((t) => ACTIVE_STATUSES.includes(t.status)).map(summary),
      closed: rows.filter((t) => !ACTIVE_STATUSES.includes(t.status)).map(summary),
    };
  }

  async detail(userId: string, id: string) {
    await this.assertCustomer(userId);
    const ticket = await this.own(userId, id);
    const [thread, history] = await Promise.all([
      this.db
        .select({
          id: ticketMessages.id,
          from: ticketMessages.authorType,
          authorName: admins.displayName,
          body: ticketMessages.body,
          createdAt: ticketMessages.createdAt,
        })
        .from(ticketMessages)
        .leftJoin(admins, eq(admins.id, ticketMessages.authorAdminId))
        .where(and(eq(ticketMessages.ticketId, id), eq(ticketMessages.internal, false)))
        .orderBy(asc(ticketMessages.createdAt)),
      this.db
        .select({ toValue: ticketEvents.toValue, createdAt: ticketEvents.createdAt })
        .from(ticketEvents)
        .where(and(eq(ticketEvents.ticketId, id), eq(ticketEvents.type, 'status')))
        .orderBy(asc(ticketEvents.createdAt)),
    ]);
    return {
      ...summary(ticket),
      description: ticket.description,
      attachments: (await this.attachments.list(id)).map(({ id: attachmentId, contentType, size, createdAt }) => ({
        id: attachmentId,
        contentType,
        size,
        createdAt,
      })),
      messages: thread.map((m) => ({ ...m, authorName: m.from === 'admin' ? (m.authorName ?? 'ทีมงาน') : null })),
      statusHistory: [{ status: 'open', at: ticket.createdAt }, ...history.map((h) => ({ status: h.toValue, at: h.createdAt }))],
    };
  }

  async create(userId: string, body: CreateTicketBody) {
    await this.assertCustomer(userId);
    const ticket = await this.tickets.create({ reporterId: userId, ...body });
    // Switched from the chat flow to the form: drop the half-finished chat report
    await this.db
      .delete(chatStates)
      .where(and(eq(chatStates.userId, userId), inArray(chatStates.step, ['choose_severity', 'confirm_severity', 'await_description'])));
    return summary(ticket);
  }

  async addMessage(userId: string, id: string, body: string) {
    await this.assertCustomer(userId);
    const ticket = await this.own(userId, id);
    if (ticket.status === 'closed') throw new ConflictException({ code: 'ticket_closed' });
    await this.tickets.addCustomerMessage(ticket, body, null);
    return this.detail(userId, id);
  }

  async addImage(userId: string, id: string, data: unknown) {
    await this.assertCustomer(userId);
    const ticket = await this.own(userId, id);
    if (ticket.status === 'closed') throw new ConflictException({ code: 'ticket_closed' });
    if (!Buffer.isBuffer(data)) throw new BadRequestException({ code: 'not_an_image' });
    return this.attachments.saveUpload(userId, ticket.id, data);
  }

  async image(userId: string, id: string, attachmentId: string) {
    await this.own(userId, id);
    return this.attachments.file(id, attachmentId);
  }

  async confirmResolved(userId: string, id: string) {
    const ticket = await this.own(userId, id);
    if (ticket.status !== 'resolved') throw new ConflictException({ code: 'not_resolved' });
    await this.tickets.customerConfirmResolved(ticket);
    return this.detail(userId, id);
  }

  async reopen(userId: string, id: string) {
    const ticket = await this.own(userId, id);
    if (ticket.status !== 'resolved') throw new ConflictException({ code: 'not_resolved' });
    await this.tickets.customerReopen(ticket);
    return this.detail(userId, id);
  }

  async rate(userId: string, id: string, rating: number, comment?: string) {
    const ticket = await this.own(userId, id);
    if (ticket.status !== 'closed') throw new ConflictException({ code: 'not_closed' });
    if (!(await this.tickets.rate(ticket, rating))) throw new ConflictException({ code: 'already_rated' });
    if (comment) await this.tickets.rateComment(ticket.id, comment);
    return this.detail(userId, id);
  }

  private async own(userId: string, id: string) {
    const ticket = await this.tickets.findOwn(userId, { id });
    // Someone else's ticket looks exactly like a missing one
    if (!ticket) throw new NotFoundException();
    return ticket;
  }
}
