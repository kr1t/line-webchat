import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HTTPFetchError, messagingApi } from '@line/bot-sdk';
import { and, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { type Admin, admins, lineUsers, messages } from '../db/schema.js';
import { LINE_MESSAGING_CLIENT } from '../line/line.constants.js';
import { ConversationStatusService } from '../conversations/conversation-status.service.js';
import { messageColumns } from './inbox.service.js';

type SendResult = { delivery: 'reply' | 'push'; error: null } | { delivery: null; error: string };

/** Maps LINE API failures to short codes the web app can explain. */
function errorCode(error: unknown): string {
  if (error instanceof HTTPFetchError) {
    if (error.status === 401) return 'line_auth';
    if (error.status === 429) return 'quota_exceeded';
    if (error.status === 400 || error.status === 403 || error.status === 404) return 'line_rejected';
  }
  return 'line_unavailable';
}

@Injectable()
export class ReplyService {
  private readonly logger = new Logger(ReplyService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(LINE_MESSAGING_CLIENT) private readonly line: messagingApi.MessagingApiClient,
    private readonly status: ConversationStatusService,
  ) {}

  /**
   * Stores the message first, then delivers it: a free reply (when a fresh reply token exists)
   * or a push message. Failures are kept on the message so the admin can retry.
   */
  async send(userId: string, text: string, admin: Admin) {
    const adminId = admin.id;
    await this.assertCanMessage(userId);
    await this.status.claimOnReply(userId, admin);

    const [message] = await this.db
      .insert(messages)
      .values({
        userId,
        direction: 'out',
        type: 'text',
        text,
        status: 'sending',
        retryKey: randomUUID(),
        sentByAdminId: adminId,
      })
      .returning({ id: messages.id, retryKey: messages.retryKey });

    const replyToken = await this.claimReplyToken(userId);
    let result: SendResult | null = null;

    if (replyToken) {
      try {
        await this.line.replyMessage({ replyToken, messages: [{ type: 'text', text }] });
        result = { delivery: 'reply', error: null };
      } catch (error) {
        // An invalid or expired token is a 400; anything else might have been delivered already
        if (!(error instanceof HTTPFetchError && error.status === 400)) {
          result = { delivery: null, error: errorCode(error) };
        }
      }
    }

    result ??= await this.push(userId, text, message.retryKey!);
    return this.finish(userId, message.id, result);
  }

  async retry(userId: string, messageId: string) {
    const [message] = await this.db
      .select({
        id: messages.id,
        text: messages.text,
        status: messages.status,
        retryKey: messages.retryKey,
        payload: messages.payload,
      })
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.userId, userId), eq(messages.direction, 'out')))
      .limit(1);

    if (!message) throw new NotFoundException();
    if (message.status !== 'failed') throw new ConflictException({ code: 'not_failed' });
    // Automatic cards are stored as a summary only; resending would deliver the summary text
    if (message.payload && (message.payload as { bot?: boolean }).bot) throw new ConflictException({ code: 'not_retryable' });
    await this.assertCanMessage(userId);

    // The same retry key lets LINE drop the push if an earlier attempt actually went through
    const result = await this.push(userId, message.text ?? '', message.retryKey ?? randomUUID());
    return this.finish(userId, message.id, result);
  }

  private async push(userId: string, text: string, retryKey: string): Promise<SendResult> {
    try {
      await this.line.pushMessage({ to: userId, messages: [{ type: 'text', text }] }, retryKey);
      return { delivery: 'push', error: null };
    } catch (error) {
      // 409 means LINE already accepted a request with this retry key
      if (error instanceof HTTPFetchError && error.status === 409) return { delivery: 'push', error: null };
      this.logger.warn(`Push message failed: ${errorCode(error)}`);
      return { delivery: null, error: errorCode(error) };
    }
  }

  private async finish(userId: string, messageId: string, result: SendResult) {
    await this.db
      .update(messages)
      .set({
        status: result.error ? 'failed' : 'sent',
        delivery: result.delivery,
        error: result.error,
      })
      .where(eq(messages.id, messageId));

    const [message] = await this.db
      .select(messageColumns)
      .from(messages)
      .leftJoin(admins, eq(admins.id, messages.sentByAdminId))
      .where(eq(messages.id, messageId));

    if (!result.error) {
      await this.db
        .update(lineUsers)
        .set({ lastMessageAt: sql`greatest(${lineUsers.lastMessageAt}, now())` })
        .where(eq(lineUsers.userId, userId));
    }
    return message;
  }

  /** Takes the newest unexpired reply token and clears it in the same statement, so it is used once. */
  private async claimReplyToken(userId: string): Promise<string | null> {
    const result = await this.db.execute<{ reply_token: string }>(sql`
      with target as (
        select id, reply_token from ${messages}
        where user_id = ${userId} and direction = 'in'
          and reply_token is not null and reply_token_expires_at > now()
        order by created_at desc
        limit 1
        for update skip locked
      )
      update ${messages} as m set reply_token = null
      from target
      where m.id = target.id
      returning target.reply_token
    `);
    return result.rows[0]?.reply_token ?? null;
  }

  private async assertCanMessage(userId: string) {
    const [user] = await this.db
      .select({ isFollowing: lineUsers.isFollowing })
      .from(lineUsers)
      .where(eq(lineUsers.userId, userId))
      .limit(1);
    if (!user) throw new NotFoundException();
    if (!user.isFollowing) throw new ConflictException({ code: 'user_blocked' });
  }
}
