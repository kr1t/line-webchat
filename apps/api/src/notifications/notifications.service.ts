import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { type Admin, conversationEvents, lineUsers, messages, ticketEvents, ticketMessages, tickets } from '../db/schema.js';
import { ticketCode } from '../tickets/sla.js';

export type NotificationType =
  | 'ticket_new'
  | 'ticket_reopened'
  | 'chat_new'
  | 'chat_transferred'
  | 'ticket_assigned'
  | 'ticket_reply';

export interface AdminNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  severity: string | null;
  createdAt: Date;
}

const LIMIT = 50;
// Without "since" (first load) only the last hour is shown
const DEFAULT_WINDOW_MS = 60 * 60_000;

const preview = (text: string | null, type: string) =>
  type === 'text' ? (text ?? '').slice(0, 120) : type === 'postback' ? `กดปุ่ม: ${text ?? ''}` : `[${type}]`;

/**
 * What an admin should know about since a moment, built from the existing tables
 * (no separate inbox to keep in sync). Things the admin did themselves are left out.
 */
@Injectable()
export class NotificationsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async since(me: Admin, since?: string): Promise<AdminNotification[]> {
    const from = since ? new Date(since) : new Date(Date.now() - DEFAULT_WINDOW_MS);

    const [newTickets, reopened, chats, transfers, assigned, replies] = await Promise.all([
      this.db
        .select({ id: tickets.id, number: tickets.number, title: tickets.title, severity: tickets.severity, at: tickets.createdAt, name: lineUsers.displayName })
        .from(tickets)
        .innerJoin(lineUsers, eq(lineUsers.userId, tickets.reporterId))
        .where(gt(tickets.createdAt, from))
        .orderBy(desc(tickets.createdAt))
        .limit(LIMIT),
      this.db
        .select({ eventId: ticketEvents.id, id: tickets.id, number: tickets.number, title: tickets.title, severity: tickets.severity, at: ticketEvents.createdAt })
        .from(ticketEvents)
        .innerJoin(tickets, eq(tickets.id, ticketEvents.ticketId))
        .where(and(gt(ticketEvents.createdAt, from), eq(ticketEvents.type, 'status'), eq(ticketEvents.reason, 'customer_reopened')))
        .limit(LIMIT),
      // Newest customer message per chat, for chats nobody has taken or that are mine
      this.db
        .selectDistinctOn([messages.userId], {
          messageId: messages.id,
          userId: messages.userId,
          type: messages.type,
          text: messages.text,
          at: messages.createdAt,
          name: lineUsers.displayName,
        })
        .from(messages)
        .innerJoin(lineUsers, eq(lineUsers.userId, messages.userId))
        .where(
          and(
            gt(messages.createdAt, from),
            eq(messages.direction, 'in'),
            or(eq(lineUsers.status, 'open'), and(eq(lineUsers.status, 'handling'), eq(lineUsers.assignedAdminId, me.id)), isNull(lineUsers.assignedAdminId)),
          ),
        )
        .orderBy(messages.userId, desc(messages.createdAt)),
      this.db
        .select({ id: conversationEvents.id, userId: conversationEvents.userId, at: conversationEvents.createdAt, name: lineUsers.displayName })
        .from(conversationEvents)
        .innerJoin(lineUsers, eq(lineUsers.userId, conversationEvents.userId))
        .where(
          and(
            gt(conversationEvents.createdAt, from),
            eq(conversationEvents.type, 'transferred'),
            sql`${conversationEvents.data}->>'toId' = ${me.id}`,
            or(isNull(conversationEvents.actorId), ne(conversationEvents.actorId, me.id)),
          ),
        )
        .limit(LIMIT),
      this.db
        .select({ eventId: ticketEvents.id, id: tickets.id, number: tickets.number, title: tickets.title, severity: tickets.severity, at: ticketEvents.createdAt })
        .from(ticketEvents)
        .innerJoin(tickets, eq(tickets.id, ticketEvents.ticketId))
        .where(
          and(
            gt(ticketEvents.createdAt, from),
            eq(ticketEvents.type, 'assignee'),
            eq(tickets.assigneeId, me.id),
            or(isNull(ticketEvents.actorId), ne(ticketEvents.actorId, me.id)),
          ),
        )
        .limit(LIMIT),
      this.db
        .select({ messageId: ticketMessages.id, id: tickets.id, number: tickets.number, severity: tickets.severity, body: ticketMessages.body, at: ticketMessages.createdAt })
        .from(ticketMessages)
        .innerJoin(tickets, eq(tickets.id, ticketMessages.ticketId))
        .where(
          and(
            gt(ticketMessages.createdAt, from),
            eq(ticketMessages.authorType, 'customer'),
            eq(tickets.assigneeId, me.id),
            // The report itself is already a "ticket_new"
            sql`${ticketMessages.createdAt} > ${tickets.createdAt} + interval '2 seconds'`,
          ),
        )
        .limit(LIMIT),
    ]);

    const items: AdminNotification[] = [
      ...newTickets.map((t) => ({
        id: `ticket_new:${t.id}`,
        type: 'ticket_new' as const,
        title: `ticket ใหม่ ${ticketCode(t.number)} · ${t.severity}`,
        body: `${t.name ?? 'ลูกค้า'}: ${t.title}`,
        href: `/tickets/${t.id}`,
        severity: t.severity,
        createdAt: t.at,
      })),
      ...reopened.map((t) => ({
        id: `ticket_reopened:${t.eventId}`,
        type: 'ticket_reopened' as const,
        title: `↩️ ${ticketCode(t.number)} ลูกค้าแจ้งว่ายังไม่หาย`,
        body: t.title,
        href: `/tickets/${t.id}`,
        severity: t.severity,
        createdAt: t.at,
      })),
      ...chats.map((c) => ({
        id: `chat_new:${c.messageId}`,
        type: 'chat_new' as const,
        title: `ข้อความใหม่จาก ${c.name ?? 'ลูกค้า'}`,
        body: preview(c.text, c.type),
        href: `/inbox/${c.userId}`,
        severity: null,
        createdAt: c.at,
      })),
      ...transfers.map((e) => ({
        id: `chat_transferred:${e.id}`,
        type: 'chat_transferred' as const,
        title: 'มีคนโอนแชทให้คุณ',
        body: e.name ?? 'ลูกค้า',
        href: `/inbox/${e.userId}`,
        severity: null,
        createdAt: e.at,
      })),
      ...assigned.map((t) => ({
        id: `ticket_assigned:${t.eventId}`,
        type: 'ticket_assigned' as const,
        title: `${ticketCode(t.number)} ถูกมอบหมายให้คุณ`,
        body: t.title,
        href: `/tickets/${t.id}`,
        severity: t.severity,
        createdAt: t.at,
      })),
      ...replies.map((m) => ({
        id: `ticket_reply:${m.messageId}`,
        type: 'ticket_reply' as const,
        title: `ลูกค้าตอบใน ${ticketCode(m.number)}`,
        body: m.body.slice(0, 120),
        href: `/tickets/${m.id}`,
        severity: m.severity,
        createdAt: m.at,
      })),
    ];
    return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, LIMIT);
  }
}
