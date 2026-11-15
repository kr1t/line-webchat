import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { HTTPFetchError, messagingApi } from '@line/bot-sdk';
import { eq, sql } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../db/database.module.js';
import { lineUsers, messages } from '../db/schema.js';
import { LINE_MESSAGING_CLIENT } from '../line/line.constants.js';
import { mascotUrl, setMascotBase } from './ticket-messages.js';

/** Automatic messages come from the bot persona, shown by LINE as the sender name (and picture). */
export const BOT_NAME = 'น้องติ๊ก';

export interface BotMessage {
  message: messagingApi.Message;
  /** What admins see in the chat for this message */
  summary: string;
}

/**
 * Sends automatic messages (ticket cards, prompts, notifications) and keeps a copy in the chat,
 * marked as sent by the system. Replies are free; pushes count against the OA's monthly quota.
 */

@Injectable()
export class BotMessengerService {
  private readonly logger = new Logger(BotMessengerService.name);

  private readonly sender: messagingApi.Sender;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(LINE_MESSAGING_CLIENT) private readonly line: messagingApi.MessagingApiClient,
    config: ConfigService<Env, true>,
  ) {
    setMascotBase(config.get('WEB_ORIGIN', { infer: true }), config.get('LIFF_ID', { infer: true }));
    const icon = mascotUrl('greet');
    this.sender = icon ? { name: BOT_NAME, iconUrl: icon } : { name: BOT_NAME };
  }

  private asBot = (item: BotMessage): messagingApi.Message => ({ ...item.message, sender: this.sender });

  /**
   * Answers the customer's latest message or button press. The reply token is taken from the
   * stored incoming message in one statement, so an admin reply cannot use it at the same time.
   */
  async reply(userId: string, sourceMessageId: string, items: BotMessage[]): Promise<void> {
    const token = await this.takeToken(sourceMessageId);
    if (token) {
      try {
        await this.line.replyMessage({ replyToken: token, messages: items.map(this.asBot) });
        await this.store(userId, items, { delivery: 'reply', error: null });
        return;
      } catch (error) {
        this.logger.warn(`Bot reply failed: ${(error as Error).message}`);
        if (!(error instanceof HTTPFetchError && error.status === 400)) {
          await this.store(userId, items, { delivery: null, error: 'line_unavailable' });
          return;
        }
      }
    }
    await this.push(userId, items);
  }

  /** Answers an event that is not stored as a chat message (e.g. someone adding the OA). */
  async replyToEvent(userId: string, replyToken: string, items: BotMessage[]): Promise<void> {
    try {
      await this.line.replyMessage({ replyToken, messages: items.map(this.asBot) });
      await this.store(userId, items, { delivery: 'reply', error: null });
    } catch (error) {
      this.logger.warn(`Bot reply failed: ${(error as Error).message}`);
    }
  }

  /** Sends without a reply token (status updates, rating requests after an admin closes a ticket). */
  async push(userId: string, items: BotMessage[]): Promise<boolean> {
    const [user] = await this.db
      .select({ isFollowing: lineUsers.isFollowing })
      .from(lineUsers)
      .where(eq(lineUsers.userId, userId))
      .limit(1);
    if (!user?.isFollowing) {
      await this.store(userId, items, { delivery: null, error: 'user_blocked' });
      return false;
    }
    try {
      await this.line.pushMessage({ to: userId, messages: items.map(this.asBot) }, randomUUID());
      await this.store(userId, items, { delivery: 'push', error: null });
      return true;
    } catch (error) {
      const code = error instanceof HTTPFetchError && error.status === 429 ? 'quota_exceeded' : 'line_unavailable';
      this.logger.warn(`Bot push failed: ${code}`);
      await this.store(userId, items, { delivery: null, error: code });
      return false;
    }
  }

  private async takeToken(messageId: string): Promise<string | null> {
    const result = await this.db.execute<{ reply_token: string }>(sql`
      with target as (
        select id, reply_token from ${messages}
        where id = ${messageId} and reply_token is not null and reply_token_expires_at > now()
        for update skip locked
      )
      update ${messages} as m set reply_token = null
      from target where m.id = target.id
      returning target.reply_token
    `);
    return result.rows[0]?.reply_token ?? null;
  }

  private async store(
    userId: string,
    items: BotMessage[],
    result: { delivery: 'reply' | 'push' | null; error: string | null },
  ) {
    if (items.length === 0) return;
    // A millisecond apart so several messages from one reply keep their order in the chat
    const now = Date.now();
    await this.db.insert(messages).values(
      items.map((item, i) => ({
        createdAt: new Date(now + i),
        userId,
        direction: 'out' as const,
        type: item.message.type === 'text' ? 'text' : 'flex',
        text: item.summary,
        payload: { bot: true },
        status: result.error ? ('failed' as const) : ('sent' as const),
        delivery: result.delivery,
        error: result.error,
      })),
    );
  }
}
