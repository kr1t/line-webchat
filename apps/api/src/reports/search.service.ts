import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { lineUsers, messages, tickets } from '../db/schema.js';
import { parseTicketCode, ticketCode } from '../tickets/sla.js';

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** One search box for tickets, people and chat messages (Cmd+K). */
@Injectable()
export class SearchService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async search(q: string) {
    const like = `%${escapeLike(q)}%`;
    const number = parseTicketCode(q);

    const [ticketRows, people, chatRows] = await Promise.all([
      this.db
        .select({ id: tickets.id, number: tickets.number, title: tickets.title, severity: tickets.severity, status: tickets.status })
        .from(tickets)
        .where(or(ilike(tickets.title, like), ilike(tickets.description, like), ...(number !== null ? [eq(tickets.number, number)] : [])))
        .orderBy(desc(tickets.createdAt))
        .limit(6),
      this.db
        .select({ userId: lineUsers.userId, displayName: lineUsers.displayName, alias: lineUsers.alias, pictureUrl: lineUsers.pictureUrl, role: lineUsers.role })
        .from(lineUsers)
        .where(or(ilike(lineUsers.displayName, like), ilike(lineUsers.alias, like)))
        .orderBy(desc(lineUsers.lastMessageAt))
        .limit(6),
      this.db
        .select({
          id: messages.id,
          userId: messages.userId,
          displayName: lineUsers.displayName,
          direction: messages.direction,
          text: messages.text,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .innerJoin(lineUsers, eq(lineUsers.userId, messages.userId))
        .where(and(eq(messages.type, 'text'), ilike(messages.text, like)))
        .orderBy(desc(messages.createdAt))
        .limit(8),
    ]);

    return {
      tickets: ticketRows.map((t) => ({ ...t, code: ticketCode(t.number) })),
      conversations: people,
      messages: chatRows,
    };
  }
}
