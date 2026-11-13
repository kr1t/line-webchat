import { Inject, Injectable, Logger } from '@nestjs/common';
import { messagingApi, webhook } from '@line/bot-sdk';
import { eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { lineUsers, messages } from '../db/schema.js';
import { LINE_MESSAGING_CLIENT, PROFILE_TTL_MS, REPLY_TOKEN_TTL_MS } from './line.constants.js';
import { toStoredContent } from './line-message.mapper.js';

@Injectable()
export class LineWebhookService {
  private readonly logger = new Logger(LineWebhookService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(LINE_MESSAGING_CLIENT) private readonly line: messagingApi.MessagingApiClient,
  ) {}

  /**
   * Events are handled one by one and every write is idempotent,
   * so LINE redelivering the same webhook never creates duplicates.
   */
  async handleEvents(events: webhook.Event[]): Promise<void> {
    for (const event of events) {
      const userId = event.source?.type === 'user' ? event.source.userId : undefined;
      if (!userId) continue; // group/room chats are out of scope

      switch (event.type) {
        case 'message':
          await this.handleMessage(userId, event);
          break;
        case 'follow':
          await this.syncUser(userId, { force: true, isFollowing: true });
          break;
        case 'unfollow':
          await this.syncUser(userId, { isFollowing: false, skipProfile: true });
          break;
        default:
          this.logger.debug(`Ignored event type: ${event.type}`);
      }
    }
  }

  private async handleMessage(userId: string, event: webhook.MessageEvent): Promise<void> {
    await this.syncUser(userId, { isFollowing: true });

    const content = toStoredContent(event.message);
    const sentAt = new Date(event.timestamp);

    const inserted = await this.db
      .insert(messages)
      .values({
        userId,
        direction: 'in',
        type: content.type,
        text: content.text,
        payload: content.payload,
        webhookEventId: event.webhookEventId,
        lineMessageId: event.message.id,
        replyToken: event.replyToken ?? null,
        replyTokenExpiresAt: event.replyToken ? new Date(sentAt.getTime() + REPLY_TOKEN_TTL_MS) : null,
        createdAt: sentAt,
      })
      .onConflictDoNothing()
      .returning({ id: messages.id });

    if (inserted.length === 0) return; // redelivery of a message we already have

    await this.db
      .update(lineUsers)
      .set({
        lastMessageAt: sql`greatest(${lineUsers.lastMessageAt}, ${sentAt.toISOString()}::timestamptz)`,
        unreadCount: sql`${lineUsers.unreadCount} + 1`,
      })
      .where(eq(lineUsers.userId, userId));
  }

  /** Creates or updates the user row, refreshing the LINE profile when it is missing or stale. */
  private async syncUser(
    userId: string,
    options: { isFollowing: boolean; force?: boolean; skipProfile?: boolean },
  ): Promise<void> {
    const [existing] = await this.db
      .select({ profileUpdatedAt: lineUsers.profileUpdatedAt })
      .from(lineUsers)
      .where(eq(lineUsers.userId, userId))
      .limit(1);

    const isStale =
      !existing?.profileUpdatedAt || Date.now() - existing.profileUpdatedAt.getTime() > PROFILE_TTL_MS;
    const profile =
      !options.skipProfile && (options.force || isStale) ? await this.fetchProfile(userId) : null;

    const profileFields = profile
      ? {
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl ?? null,
          statusMessage: profile.statusMessage ?? null,
          profileUpdatedAt: new Date(),
        }
      : {};

    await this.db
      .insert(lineUsers)
      .values({ userId, isFollowing: options.isFollowing, ...profileFields })
      .onConflictDoUpdate({
        target: lineUsers.userId,
        set: { isFollowing: options.isFollowing, ...profileFields },
      });
  }

  private async fetchProfile(userId: string): Promise<messagingApi.UserProfileResponse | null> {
    try {
      return await this.line.getProfile(userId);
    } catch (error) {
      // Profiles are unavailable when the user blocked the OA; keep the message anyway
      this.logger.warn(`Could not fetch LINE profile: ${(error as Error).message}`);
      return null;
    }
  }
}
