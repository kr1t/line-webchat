import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { ConversationStatusService } from '../conversations/conversation-status.service.js';
import { DB, type Database } from '../db/database.module.js';
import { type Ticket, ticketEvents, ticketMessages, tickets } from '../db/schema.js';
import { ACTIVE_STATUSES, dueDates, type Severity, ticketCode } from './sla.js';

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 5000;

/** First line of what the customer wrote, shortened for lists and cards. */
export function titleFrom(text: string): string {
  const firstLine = text.trim().split(/\r?\n/)[0].trim();
  return firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX - 1)}…` : firstLine;
}

/** Ticket lifecycle shared by the LINE chat flow, the LIFF pages and the CMS. */
@Injectable()
export class TicketsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly conversations: ConversationStatusService,
  ) {}

  async create(input: {
    reporterId: string;
    severity: Severity;
    description: string;
    title?: string;
    category?: Ticket['category'];
    messageId?: string | null;
  }): Promise<Ticket> {
    const now = new Date();
    const description = input.description.trim().slice(0, DESCRIPTION_MAX);
    const ticket = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(tickets)
        .values({
          reporterId: input.reporterId,
          title: input.title?.trim() || titleFrom(description),
          description,
          category: input.category ?? 'other',
          severity: input.severity,
          reportedSeverity: input.severity,
          ...dueDates(now, input.severity),
          createdAt: now,
        })
        .returning();
      await tx.insert(ticketMessages).values({
        ticketId: created.id,
        authorType: 'customer',
        body: description,
        messageId: input.messageId ?? null,
      });
      await tx.insert(ticketEvents).values({ ticketId: created.id, type: 'created', toValue: input.severity });
      return created;
    });
    await this.conversations.log(input.reporterId, null, 'ticket_created', {
      ticketId: ticket.id,
      code: ticketCode(ticket.number),
      severity: ticket.severity,
    });
    return ticket;
  }

  async findOwn(reporterId: string, where: { id?: string; number?: number }): Promise<Ticket | null> {
    if (!where.id && !where.number) return null;
    const [ticket] = await this.db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.reporterId, reporterId),
          where.id ? eq(tickets.id, where.id) : eq(tickets.number, where.number!),
        ),
      )
      .limit(1);
    return ticket ?? null;
  }

  async listOwn(reporterId: string, { active, limit = 10 }: { active: boolean; limit?: number }) {
    return this.db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.reporterId, reporterId),
          active ? inArray(tickets.status, ACTIVE_STATUSES) : notInArray(tickets.status, ACTIVE_STATUSES),
        ),
      )
      .orderBy(desc(tickets.createdAt))
      .limit(limit);
  }

  async countOwn(reporterId: string) {
    const [row] = await this.db
      .select({
        active: sql<number>`count(*) filter (where ${inArray(tickets.status, ACTIVE_STATUSES)})`.mapWith(Number),
        closed: count(),
      })
      .from(tickets)
      .where(eq(tickets.reporterId, reporterId));
    return { active: row.active, closed: row.closed - row.active };
  }

  /** Customer adds details; a ticket waiting on them goes back to the team and the SLA clock restarts. */
  async addCustomerMessage(ticket: Ticket, body: string, messageId: string | null) {
    await this.db.insert(ticketMessages).values({
      ticketId: ticket.id,
      authorType: 'customer',
      body: body.trim().slice(0, DESCRIPTION_MAX),
      messageId,
    });
    if (ticket.status === 'waiting_customer') await this.changeStatus(ticket, 'in_progress', null);
    else await this.db.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, ticket.id));
  }

  async customerConfirmResolved(ticket: Ticket) {
    await this.changeStatus(ticket, 'closed', null, 'customer_confirmed');
  }

  async customerReopen(ticket: Ticket) {
    await this.changeStatus(ticket, 'in_progress', null, 'customer_reopened');
  }

  async rate(ticket: Ticket, rating: number) {
    const updated = await this.db
      .update(tickets)
      .set({ rating, ratedAt: new Date() })
      .where(and(eq(tickets.id, ticket.id), sql`${tickets.rating} is null`))
      .returning({ id: tickets.id });
    if (updated.length === 0) return false;
    await this.db.insert(ticketEvents).values({ ticketId: ticket.id, type: 'rated', toValue: String(rating) });
    return true;
  }

  async rateComment(ticketId: string, comment: string) {
    await this.db
      .update(tickets)
      .set({ ratingComment: comment.trim().slice(0, 1000) })
      .where(and(eq(tickets.id, ticketId), sql`${tickets.ratingComment} is null`));
  }

  /**
   * Moves a ticket to a new status and keeps the SLA bookkeeping right:
   * pause while waiting for the customer, stamp resolve/close times, record misses.
   */
  async changeStatus(ticket: Ticket, to: Ticket['status'], actorId: string | null, reason?: string) {
    if (ticket.status === to) return ticket;
    const now = new Date();
    const patch: Partial<typeof tickets.$inferInsert> = { status: to };

    if (ticket.pausedAt && to !== 'waiting_customer') {
      patch.pausedSeconds = ticket.pausedSeconds + Math.round((now.getTime() - ticket.pausedAt.getTime()) / 1000);
      patch.pausedAt = null;
    }
    if (to === 'waiting_customer' && !ticket.pausedAt) patch.pausedAt = now;

    const pausedTotalMs = (patch.pausedSeconds ?? ticket.pausedSeconds) * 1000;
    if ((to === 'resolved' || to === 'closed') && !ticket.resolvedAt) {
      patch.resolvedAt = now;
      if (ticket.resolveDueAt) patch.resolveBreached = now.getTime() > ticket.resolveDueAt.getTime() + pausedTotalMs;
    }
    if (to === 'closed') patch.closedAt = now;
    if (to !== 'closed' && to !== 'resolved') {
      patch.resolvedAt = null;
      patch.closedAt = null;
    }
    if (actorId && !ticket.firstResponseAt && to !== 'open') {
      patch.firstResponseAt = now;
      patch.responseBreached = now.getTime() > ticket.responseDueAt.getTime() + pausedTotalMs;
    }

    const [updated] = await this.db.update(tickets).set(patch).where(eq(tickets.id, ticket.id)).returning();
    await this.db.insert(ticketEvents).values({
      ticketId: ticket.id,
      actorId,
      type: 'status',
      fromValue: ticket.status,
      toValue: to,
      reason: reason ?? null,
    });
    return updated;
  }
}
