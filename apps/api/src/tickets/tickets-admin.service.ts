import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gt, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DB, type Database } from '../db/database.module.js';
import { type Admin, admins, lineUsers, messages, type Ticket, ticketEvents, ticketMessages, tickets } from '../db/schema.js';
import { ReplyService } from '../inbox/reply.service.js';
import { AttachmentsService } from './attachments.service.js';
import { BotMessengerService } from './bot-messenger.service.js';
import { CustomerFlowService } from './customer-flow.service.js';
import { QuotaService } from './quota.service.js';
import { ACTIVE_STATUSES, deadlineState, dueDates, effectiveDue, parseTicketCode, ticketCode } from './sla.js';
import * as say from './ticket-messages.js';
import type { ListTicketsQuery, UpdateTicketBody } from './tickets.schemas.js';
import { TicketsService } from './tickets.service.js';

const assignee = alias(admins, 'assignee');

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Pause-adjusted deadline of whatever the team owes next (first reply, then the fix). */
const nextDueSql = sql<Date | null>`case
  when ${tickets.status} in ('resolved', 'closed') then null
  when ${tickets.firstResponseAt} is null then ${tickets.responseDueAt}
  else ${tickets.resolveDueAt}
end + (${tickets.pausedSeconds} + coalesce(extract(epoch from now() - ${tickets.pausedAt}), 0)) * interval '1 second'`;

@Injectable()
export class TicketsAdminService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tickets: TicketsService,
    private readonly replies: ReplyService,
    private readonly bot: BotMessengerService,
    private readonly flow: CustomerFlowService,
    private readonly quota: QuotaService,
    private readonly attachments: AttachmentsService,
  ) {}

  async list(query: Omit<ListTicketsQuery, 'limit'> & { limit: number }, me: Admin) {
    const conditions: SQL[] = [];
    if (query.status === 'active') conditions.push(inArray(tickets.status, ACTIVE_STATUSES));
    else if (query.status !== 'all') conditions.push(eq(tickets.status, query.status));
    if (query.severity) conditions.push(eq(tickets.severity, query.severity));
    if (query.category) conditions.push(eq(tickets.category, query.category));
    if (query.reporterId) conditions.push(eq(tickets.reporterId, query.reporterId));
    if (query.assignee === 'me') conditions.push(eq(tickets.assigneeId, me.id));
    else if (query.assignee === 'unassigned') conditions.push(isNull(tickets.assigneeId));
    else if (query.assignee) conditions.push(eq(tickets.assigneeId, query.assignee));
    if (query.reopened) conditions.push(gt(tickets.reopenCount, 0));
    if (query.from) conditions.push(gte(tickets.createdAt, new Date(query.from)));
    if (query.to) conditions.push(lt(tickets.createdAt, new Date(query.to)));
    if (query.q) {
      const number = parseTicketCode(query.q);
      const like = `%${escapeLike(query.q)}%`;
      conditions.push(
        or(
          ilike(tickets.title, like),
          ilike(tickets.description, like),
          ilike(lineUsers.displayName, like),
          ...(number !== null ? [eq(tickets.number, number)] : []),
        )!,
      );
    }

    const rows = await this.db
      .select({
        ticket: tickets,
        reporterName: lineUsers.displayName,
        reporterPicture: lineUsers.pictureUrl,
        assigneeName: assignee.displayName,
        nextDueAt: nextDueSql,
      })
      .from(tickets)
      .innerJoin(lineUsers, eq(lineUsers.userId, tickets.reporterId))
      .leftJoin(assignee, eq(assignee.id, tickets.assigneeId))
      .where(and(...conditions))
      .orderBy(sql`${nextDueSql} asc nulls last`, sql`${tickets.createdAt} desc`)
      .limit(query.limit);

    const now = new Date();
    const items = rows.map((row) => this.toListItem(row.ticket, row, now));
    return query.sla ? items.filter((t) => t.sla.current === query.sla) : items;
  }

  async counts(me: Admin) {
    const [row] = await this.db
      .select({
        active: sql<number>`count(*)`.mapWith(Number),
        unassigned: sql<number>`count(*) filter (where ${tickets.assigneeId} is null)`.mapWith(Number),
        mine: sql<number>`count(*) filter (where ${tickets.assigneeId} = ${me.id})`.mapWith(Number),
        breached: sql<number>`count(*) filter (where ${nextDueSql} < now())`.mapWith(Number),
        urgent: sql<number>`count(*) filter (where ${tickets.severity} in ('P1', 'P2') and ${tickets.firstResponseAt} is null)`.mapWith(Number),
        reopened: sql<number>`count(*) filter (where ${tickets.reopenCount} > 0)`.mapWith(Number),
      })
      .from(tickets)
      .where(inArray(tickets.status, ACTIVE_STATUSES));
    return row;
  }

  async detail(id: string) {
    const [row] = await this.db
      .select({
        ticket: tickets,
        reporterName: lineUsers.displayName,
        reporterPicture: lineUsers.pictureUrl,
        reporterFollowing: lineUsers.isFollowing,
        assigneeName: assignee.displayName,
      })
      .from(tickets)
      .innerJoin(lineUsers, eq(lineUsers.userId, tickets.reporterId))
      .leftJoin(assignee, eq(assignee.id, tickets.assigneeId))
      .where(eq(tickets.id, id))
      .limit(1);
    if (!row) throw new NotFoundException();

    const author = alias(admins, 'author');
    const [thread, history] = await Promise.all([
      this.db
        .select({
          id: ticketMessages.id,
          authorType: ticketMessages.authorType,
          authorName: author.displayName,
          body: ticketMessages.body,
          internal: ticketMessages.internal,
          status: messages.status,
          error: messages.error,
          createdAt: ticketMessages.createdAt,
        })
        .from(ticketMessages)
        .leftJoin(author, eq(author.id, ticketMessages.authorAdminId))
        .leftJoin(messages, eq(messages.id, ticketMessages.messageId))
        .where(eq(ticketMessages.ticketId, id))
        .orderBy(asc(ticketMessages.createdAt)),
      this.db
        .select({
          id: ticketEvents.id,
          type: ticketEvents.type,
          fromValue: ticketEvents.fromValue,
          toValue: ticketEvents.toValue,
          reason: ticketEvents.reason,
          actorName: admins.displayName,
          createdAt: ticketEvents.createdAt,
        })
        .from(ticketEvents)
        .leftJoin(admins, eq(admins.id, ticketEvents.actorId))
        .where(eq(ticketEvents.ticketId, id))
        .orderBy(asc(ticketEvents.createdAt)),
    ]);

    return {
      ...this.toListItem(row.ticket, row, new Date()),
      attachments: await this.attachments.list(id),
      description: row.ticket.description,
      reporterFollowing: row.reporterFollowing,
      ratingComment: row.ticket.ratingComment,
      messages: thread,
      events: history,
    };
  }

  async update(id: string, body: UpdateTicketBody, actor: Admin) {
    let ticket = await this.get(id);

    if (body.assigneeId !== undefined && body.assigneeId !== ticket.assigneeId) {
      let name: string | null = null;
      if (body.assigneeId) {
        const [target] = await this.db
          .select({ displayName: admins.displayName })
          .from(admins)
          .where(and(eq(admins.id, body.assigneeId), eq(admins.isActive, true)))
          .limit(1);
        if (!target) throw new BadRequestException({ code: 'invalid_admin' });
        name = target.displayName;
      }
      [ticket] = await this.db.update(tickets).set({ assigneeId: body.assigneeId }).where(eq(tickets.id, id)).returning();
      await this.db.insert(ticketEvents).values({ ticketId: id, actorId: actor.id, type: 'assignee', toValue: name });
    }

    if (body.category && body.category !== ticket.category) {
      await this.db.insert(ticketEvents).values({
        ticketId: id,
        actorId: actor.id,
        type: 'category',
        fromValue: ticket.category,
        toValue: body.category,
      });
      [ticket] = await this.db.update(tickets).set({ category: body.category }).where(eq(tickets.id, id)).returning();
    }

    if (body.severity && body.severity !== ticket.severity) {
      const previous = ticket.severity;
      // Deadlines always count from when the customer reported
      [ticket] = await this.db
        .update(tickets)
        .set({ severity: body.severity, ...dueDates(ticket.createdAt, body.severity) })
        .where(eq(tickets.id, id))
        .returning();
      await this.db.insert(ticketEvents).values({
        ticketId: id,
        actorId: actor.id,
        type: 'severity',
        fromValue: previous,
        toValue: body.severity,
        reason: body.severityReason,
      });
    }

    if (body.status && body.status !== ticket.status) {
      ticket = await this.tickets.changeStatus(ticket, body.status, actor.id);
      await this.notifyStatus(ticket);
    }

    return this.detail(id);
  }

  /** Replies go to the customer's LINE chat (tagged with the ticket code); internal notes stay here. */
  async addMessage(id: string, body: { body: string; internal: boolean }, actor: Admin) {
    const ticket = await this.get(id);
    if (body.internal) {
      await this.db.insert(ticketMessages).values({
        ticketId: id,
        authorType: 'admin',
        authorAdminId: actor.id,
        body: body.body,
        internal: true,
      });
      return this.detail(id);
    }

    const sent = await this.replies.send(ticket.reporterId, `[${ticketCode(ticket.number)}] ${body.body}`, actor);
    await this.db.insert(ticketMessages).values({
      ticketId: id,
      authorType: 'admin',
      authorAdminId: actor.id,
      body: body.body,
      messageId: sent.id,
    });

    if (sent.status === 'sent') {
      if (ticket.status === 'open') {
        await this.tickets.changeStatus(ticket, 'acknowledged', actor.id, 'first_reply');
      } else if (!ticket.firstResponseAt) {
        const now = new Date();
        await this.db
          .update(tickets)
          .set({
            firstResponseAt: now,
            responseBreached: now.getTime() > ticket.responseDueAt.getTime() + ticket.pausedSeconds * 1000,
          })
          .where(eq(tickets.id, id));
      }
    }
    return this.detail(id);
  }

  /** Copies something the customer wrote in the normal chat into a ticket. */
  async attachChatMessage(id: string, messageId: string) {
    const ticket = await this.get(id);
    const [message] = await this.db
      .select({ id: messages.id, text: messages.text, type: messages.type, direction: messages.direction })
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.userId, ticket.reporterId)))
      .limit(1);
    if (!message || message.direction !== 'in' || message.type !== 'text' || !message.text) {
      throw new BadRequestException({ code: 'not_attachable' });
    }
    const [existing] = await this.db
      .select({ id: ticketMessages.id })
      .from(ticketMessages)
      .where(and(eq(ticketMessages.ticketId, id), eq(ticketMessages.messageId, messageId)))
      .limit(1);
    if (existing) throw new ConflictException({ code: 'already_attached' });
    await this.tickets.addCustomerMessage(ticket, message.text, message.id);
    return this.detail(id);
  }

  private async notifyStatus(ticket: Ticket) {
    // Opening/acknowledging is visible from replies already; tell the customer about real progress
    if (!['in_progress', 'waiting_customer', 'resolved', 'closed'].includes(ticket.status)) return;
    if (await this.quota.isExhausted()) return;
    const card = {
      id: ticket.id,
      number: ticket.number,
      title: ticket.title,
      severity: ticket.severity,
      status: ticket.status,
      createdAt: ticket.createdAt,
    };
    const items =
      ticket.status === 'closed' && ticket.rating === null
        ? [say.statusChanged(card, this.flow.liffUrl(ticket.id)), say.askRating(card)]
        : [say.statusChanged(card, this.flow.liffUrl(ticket.id))];
    await this.bot.push(ticket.reporterId, items);
  }

  private async get(id: string): Promise<Ticket> {
    const [ticket] = await this.db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
    if (!ticket) throw new NotFoundException();
    return ticket;
  }

  private toListItem(
    t: Ticket,
    joined: { reporterName: string | null; reporterPicture: string | null; assigneeName: string | null },
    now: Date,
  ) {
    const response = deadlineState(t, t.responseDueAt, t.firstResponseAt, now);
    const resolve = deadlineState(t, t.resolveDueAt, t.resolvedAt, now);
    const active = ACTIVE_STATUSES.includes(t.status) && t.status !== 'resolved';
    const current = !active ? null : t.firstResponseAt ? resolve : response;
    return {
      id: t.id,
      code: ticketCode(t.number),
      number: t.number,
      title: t.title,
      category: t.category,
      severity: t.severity,
      reportedSeverity: t.reportedSeverity,
      status: t.status,
      reporter: { userId: t.reporterId, displayName: joined.reporterName, pictureUrl: joined.reporterPicture },
      assigneeId: t.assigneeId,
      assigneeName: joined.assigneeName,
      createdAt: t.createdAt,
      firstResponseAt: t.firstResponseAt,
      resolvedAt: t.resolvedAt,
      closedAt: t.closedAt,
      rating: t.rating,
      reopenCount: t.reopenCount,
      reopenedAt: t.reopenedAt,
      sla: {
        response,
        resolve,
        current: current === 'ok' || current === 'at_risk' || current === 'breached' ? current : null,
        responseDueAt: effectiveDue(t, t.responseDueAt, t.firstResponseAt ?? now),
        resolveDueAt: effectiveDue(t, t.resolveDueAt, t.resolvedAt ?? now),
        paused: t.pausedAt !== null,
      },
    };
  }
}
