import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, ilike, inArray, lt, min, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DB, type Database } from '../db/database.module.js';
import { admins, conversationEvents, conversationPins, lineUsers, messages } from '../db/schema.js';
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

const assigned = alias(admins, 'assigned');

// Pins: a team pin shows for everyone, a personal pin only for the admin who made it
const teamPinSql = sql<boolean>`exists (select 1 from conversation_pins p where p.user_id = ${lineUsers.userId} and p.team)`;
const teamPinBySql = sql<string | null>`(select a.display_name from conversation_pins p join admins a on a.id = p.pinned_by_id where p.user_id = ${lineUsers.userId} and p.team limit 1)`;
const minePinSql = (adminId: string) =>
  sql<boolean>`exists (select 1 from conversation_pins p where p.user_id = ${lineUsers.userId} and not p.team and p.pinned_by_id = ${adminId})`;

const userColumns = {
  userId: lineUsers.userId,
  displayName: lineUsers.displayName,
  pictureUrl: lineUsers.pictureUrl,
  isFollowing: lineUsers.isFollowing,
  unreadCount: lineUsers.unreadCount,
  lastMessageAt: lineUsers.lastMessageAt,
  alias: lineUsers.alias,
  remark: lineUsers.remark,
  role: lineUsers.role,
  status: lineUsers.status,
  assignedAdminId: lineUsers.assignedAdminId,
  assignedName: assigned.displayName,
};

const CONVERSATION_LIMIT = 200;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

@Injectable()
export class InboxService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listConversations(query: ListConversationsQuery, adminId: string) {
    const conditions: SQL[] = [];
    if (query.q) {
      const like = `%${escapeLike(query.q)}%`;
      conditions.push(or(ilike(lineUsers.displayName, like), ilike(lineUsers.alias, like))!);
    }
    if (query.filter === 'pinned') conditions.push(sql`(${teamPinSql} or ${minePinSql(adminId)})`);
    if (query.filter === 'unread') conditions.push(gt(lineUsers.unreadCount, 0));
    if (query.filter === 'open' || query.filter === 'handling' || query.filter === 'closed') {
      conditions.push(eq(lineUsers.status, query.filter));
    }
    if (query.filter === 'mine') {
      conditions.push(eq(lineUsers.status, 'handling'), eq(lineUsers.assignedAdminId, adminId));
    }

    const users = await this.db
      .select({ ...userColumns, pinnedTeam: teamPinSql, pinnedTeamBy: teamPinBySql, pinnedByMe: minePinSql(adminId) })
      .from(lineUsers)
      .leftJoin(assigned, eq(assigned.id, lineUsers.assignedAdminId))
      .where(and(...conditions))
      // Team pins first, then my pins, then the latest chats
      .orderBy(sql`${teamPinSql} desc`, sql`${minePinSql(adminId)} desc`, sql`${lineUsers.lastMessageAt} desc nulls last`, asc(lineUsers.userId))
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

  /** Numbers for the list tabs. */
  async counts(adminId: string) {
    const [row] = await this.db
      .select({
        open: sql<number>`count(*) filter (where ${lineUsers.status} = 'open')`.mapWith(Number),
        mine: sql<number>`count(*) filter (where ${lineUsers.status} = 'handling' and ${lineUsers.assignedAdminId} = ${adminId})`.mapWith(Number),
        handling: sql<number>`count(*) filter (where ${lineUsers.status} = 'handling')`.mapWith(Number),
        unread: sql<number>`count(*) filter (where ${lineUsers.unreadCount} > 0)`.mapWith(Number),
      })
      .from(lineUsers);
    return row;
  }

  async getConversation(userId: string, adminId: string) {
    const [user] = await this.db
      .select({
        ...userColumns,
        pinnedTeam: teamPinSql,
        pinnedTeamBy: teamPinBySql,
        pinnedByMe: minePinSql(adminId),
        statusMessage: lineUsers.statusMessage,
        roleGrantedAt: lineUsers.roleGrantedAt,
        createdAt: lineUsers.createdAt,
      })
      .from(lineUsers)
      .leftJoin(assigned, eq(assigned.id, lineUsers.assignedAdminId))
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

  async setProfile(userId: string, body: { alias?: string | null; remark?: string | null }, adminId: string) {
    await this.ensureUser(userId);
    const [before] = await this.db.select({ alias: lineUsers.alias }).from(lineUsers).where(eq(lineUsers.userId, userId));
    await this.db.update(lineUsers).set(body).where(eq(lineUsers.userId, userId));
    if (body.alias !== undefined && body.alias !== before.alias) {
      await this.db.insert(conversationEvents).values({ userId, actorId: adminId, type: 'renamed', data: { alias: body.alias } });
    }
  }

  async pin(userId: string, adminId: string, team: boolean) {
    await this.ensureUser(userId);
    await this.db.insert(conversationPins).values({ userId, pinnedById: adminId, team }).onConflictDoNothing();
  }

  /** Anyone can take down a team pin; a personal pin is only removed for its owner. */
  async unpin(userId: string, adminId: string, team: boolean) {
    await this.db
      .delete(conversationPins)
      .where(
        team
          ? and(eq(conversationPins.userId, userId), eq(conversationPins.team, true))
          : and(eq(conversationPins.userId, userId), eq(conversationPins.team, false), eq(conversationPins.pinnedById, adminId)),
      );
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
