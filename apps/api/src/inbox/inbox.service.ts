import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, ilike, inArray, lt, min, sql, type SQL } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { admins, lineUsers, messages } from '../db/schema.js';
import type { ListConversationsQuery, ListMessagesQuery } from './inbox.schemas.js';

// Only these columns ever leave the API (reply tokens and retry keys stay server-side)
export const messageColumns = {
  id: messages.id,
  direction: messages.direction,
  type: messages.type,
  text: messages.text,
  payload: messages.payload,
  status: messages.status,
  error: messages.error,
  sentByName: admins.displayName,
  createdAt: messages.createdAt,
};

const userColumns = {
  userId: lineUsers.userId,
  displayName: lineUsers.displayName,
  pictureUrl: lineUsers.pictureUrl,
  isFollowing: lineUsers.isFollowing,
  unreadCount: lineUsers.unreadCount,
  lastMessageAt: lineUsers.lastMessageAt,
};

const CONVERSATION_LIMIT = 200;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

@Injectable()
export class InboxService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listConversations(query: ListConversationsQuery) {
    const conditions: SQL[] = [];
    if (query.q) conditions.push(ilike(lineUsers.displayName, `%${escapeLike(query.q)}%`));
    if (query.filter === 'unread') conditions.push(gt(lineUsers.unreadCount, 0));

    const users = await this.db
      .select(userColumns)
      .from(lineUsers)
      .where(and(...conditions))
      .orderBy(sql`${lineUsers.lastMessageAt} desc nulls last`, asc(lineUsers.userId))
      .limit(CONVERSATION_LIMIT);

    if (users.length === 0) return [];

    const lastMessages = await this.db
      .selectDistinctOn([messages.userId], {
        userId: messages.userId,
        direction: messages.direction,
        type: messages.type,
        text: messages.text,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(inArray(messages.userId, users.map((u) => u.userId)))
      .orderBy(messages.userId, desc(messages.createdAt));

    const byUser = new Map(lastMessages.map(({ userId, ...rest }) => [userId, rest]));
    return users.map((user) => ({ ...user, lastMessage: byUser.get(user.userId) ?? null }));
  }

  async getConversation(userId: string) {
    const [user] = await this.db
      .select({
        ...userColumns,
        statusMessage: lineUsers.statusMessage,
        createdAt: lineUsers.createdAt,
      })
      .from(lineUsers)
      .where(eq(lineUsers.userId, userId))
      .limit(1);
    if (!user) throw new NotFoundException();

    const [stats] = await this.db
      .select({ messageCount: count(), firstMessageAt: min(messages.createdAt) })
      .from(messages)
      .where(eq(messages.userId, userId));

    return { ...user, messageCount: stats?.messageCount ?? 0, firstMessageAt: stats?.firstMessageAt ?? null };
  }

  /**
   * Returns a page of messages oldest-first. Without `before` it is the latest page,
   * which the web app re-fetches while polling and merges by id (webhooks can arrive late,
   * so a timestamp cursor could skip messages).
   */
  async listMessages(userId: string, query: ListMessagesQuery) {
    await this.ensureUser(userId);

    const conditions: SQL[] = [eq(messages.userId, userId)];
    if (query.before) conditions.push(lt(messages.createdAt, new Date(query.before)));

    const rows = await this.db
      .select(messageColumns)
      .from(messages)
      .leftJoin(admins, eq(admins.id, messages.sentByAdminId))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    return { messages: page.reverse(), hasMore };
  }

  async markAsRead(userId: string) {
    const updated = await this.db
      .update(lineUsers)
      .set({ unreadCount: 0 })
      .where(eq(lineUsers.userId, userId))
      .returning({ userId: lineUsers.userId });
    if (updated.length === 0) throw new NotFoundException();
  }

  private async ensureUser(userId: string) {
    const [user] = await this.db
      .select({ userId: lineUsers.userId })
      .from(lineUsers)
      .where(eq(lineUsers.userId, userId))
      .limit(1);
    if (!user) throw new NotFoundException();
  }
}
