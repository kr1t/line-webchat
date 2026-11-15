import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, ne, or, isNull, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { type Admin, admins, conversationEvents, lineUsers } from '../db/schema.js';

export type ConversationEventType =
  | 'claimed'
  | 'transferred'
  | 'closed'
  | 'reopened'
  | 'role_granted'
  | 'role_revoked'
  | 'ticket_created'
  | 'ticket_reopened'
  | 'ticket_confirmed';

const EVENT_LIMIT = 200;

/**
 * Open → handling (someone took the chat) → closed. A customer writing to a closed chat
 * opens it again. Every change is kept as a conversation event shown inside the chat.
 */
@Injectable()
export class ConversationStatusService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async claim(userId: string, actor: Admin) {
    const [before] = await this.getState(userId);
    if (!before) throw new NotFoundException();
    if (before.status === 'handling' && before.assignedAdminId === actor.id) return;

    await this.setState(userId, { status: 'handling', assignedAdminId: actor.id });
    await this.log(userId, actor.id, 'claimed', before.assignedName ? { fromName: before.assignedName } : null);
  }

  /** Takes the chat when an admin replies to a chat nobody is handling. */
  async claimOnReply(userId: string, actor: Admin) {
    const updated = await this.db
      .update(lineUsers)
      .set({ status: 'handling', assignedAdminId: actor.id, statusChangedAt: new Date() })
      .where(and(eq(lineUsers.userId, userId), or(ne(lineUsers.status, 'handling'), isNull(lineUsers.assignedAdminId))))
      .returning({ userId: lineUsers.userId });
    if (updated.length > 0) await this.log(userId, actor.id, 'claimed', { auto: true });
  }

  async transfer(userId: string, actor: Admin, toAdminId: string) {
    const [before] = await this.getState(userId);
    if (!before) throw new NotFoundException();

    const [target] = await this.db
      .select({ id: admins.id, displayName: admins.displayName })
      .from(admins)
      .where(and(eq(admins.id, toAdminId), eq(admins.isActive, true)))
      .limit(1);
    if (!target) throw new BadRequestException({ code: 'invalid_admin' });

    await this.setState(userId, { status: 'handling', assignedAdminId: target.id });
    await this.log(userId, actor.id, 'transferred', { toId: target.id, toName: target.displayName });
  }

  async close(userId: string, actor: Admin) {
    const [before] = await this.getState(userId);
    if (!before) throw new NotFoundException();
    if (before.status === 'closed') return;

    await this.setState(userId, { status: 'closed', assignedAdminId: null });
    await this.log(userId, actor.id, 'closed', null);
  }

  /** Called for every new message from the customer. */
  async reopenIfClosed(userId: string) {
    const updated = await this.db
      .update(lineUsers)
      .set({ status: 'open', assignedAdminId: null, statusChangedAt: new Date() })
      .where(and(eq(lineUsers.userId, userId), eq(lineUsers.status, 'closed')))
      .returning({ userId: lineUsers.userId });
    if (updated.length > 0) await this.log(userId, null, 'reopened', null);
  }

  async log(userId: string, actorId: string | null, type: ConversationEventType, data: Record<string, unknown> | null) {
    await this.db.insert(conversationEvents).values({ userId, actorId, type, data });
  }

  async listEvents(userId: string) {
    const rows = await this.db
      .select({
        id: conversationEvents.id,
        type: conversationEvents.type,
        data: conversationEvents.data,
        actorName: admins.displayName,
        createdAt: conversationEvents.createdAt,
      })
      .from(conversationEvents)
      .leftJoin(admins, eq(admins.id, conversationEvents.actorId))
      .where(eq(conversationEvents.userId, userId))
      .orderBy(asc(conversationEvents.createdAt))
      .limit(EVENT_LIMIT);
    return rows;
  }

  /** Active admins anyone can hand a chat or ticket to. */
  team() {
    return this.db
      .select({ id: admins.id, displayName: admins.displayName })
      .from(admins)
      .where(eq(admins.isActive, true))
      .orderBy(asc(admins.displayName));
  }

  private getState(userId: string) {
    return this.db
      .select({
        status: lineUsers.status,
        assignedAdminId: lineUsers.assignedAdminId,
        assignedName: admins.displayName,
      })
      .from(lineUsers)
      .leftJoin(admins, eq(admins.id, lineUsers.assignedAdminId))
      .where(eq(lineUsers.userId, userId))
      .limit(1);
  }

  private async setState(userId: string, state: Pick<typeof lineUsers.$inferInsert, 'status' | 'assignedAdminId'>) {
    await this.db
      .update(lineUsers)
      .set({ ...state, statusChangedAt: sql`now()` })
      .where(eq(lineUsers.userId, userId));
  }
}
