import type { Readable } from 'node:stream';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { messagingApi } from '@line/bot-sdk';
import { and, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { messageMedia, messages } from '../db/schema.js';
import { LINE_BLOB_CLIENT } from '../line/line.constants.js';
import { sniffImage } from '../tickets/attachments.service.js';

// A serverless response carries about 4.5 MB, so larger files stay in LINE only
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
export const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'file']);

// Played in the browser; anything else is only ever downloaded
const PLAYABLE = new Set(['video/mp4', 'video/quicktime', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg']);

export type MediaState = 'stored' | 'too_large' | 'unavailable';

async function readLimited(stream: Readable, limit: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += (chunk as Buffer).length;
    if (size > limit) {
      stream.destroy();
      return null;
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Decides how a stored file may be served: inline only for real images and known audio/video. */
export function servingType(messageType: string, stored: string, data: Buffer): { contentType: string; inline: boolean } {
  if (messageType === 'image') {
    const sniffed = sniffImage(data);
    return sniffed ? { contentType: sniffed, inline: true } : { contentType: 'application/octet-stream', inline: false };
  }
  if ((messageType === 'video' || messageType === 'audio') && PLAYABLE.has(stored)) return { contentType: stored, inline: true };
  return { contentType: 'application/octet-stream', inline: false };
}

/** Keeps only letters, digits and a few safe characters for a download name. */
export function safeFileName(name: unknown, fallback: string): string {
  const cleaned = typeof name === 'string' ? name.replace(/[^\p{L}\p{M}\p{N}._ -]/gu, '_').trim().slice(0, 100) : '';
  return cleaned || fallback;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(LINE_BLOB_CLIENT) private readonly blob: messagingApi.MessagingApiBlobClient,
  ) {}

  /** Copies the content of an incoming LINE media message and records the outcome on the message. */
  async capture(messageId: string, lineMessageId: string): Promise<MediaState> {
    let state: MediaState = 'unavailable';
    try {
      const { httpResponse, body } = await this.blob.getMessageContentWithHttpInfo(lineMessageId);
      const declared = Number(httpResponse.headers.get('content-length') ?? 0);
      const data = declared > MAX_MEDIA_BYTES ? null : await readLimited(body, MAX_MEDIA_BYTES);
      if (!data) {
        body.destroy();
        state = 'too_large';
      } else {
        const contentType = (httpResponse.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim().toLowerCase();
        await this.db.insert(messageMedia).values({ messageId, contentType, size: data.length, data }).onConflictDoNothing();
        state = 'stored';
      }
    } catch (error) {
      this.logger.warn(`Could not copy media from LINE: ${(error as Error).message}`);
    }
    await this.db
      .update(messages)
      .set({ payload: sql`coalesce(${messages.payload}, '{}'::jsonb) || ${JSON.stringify({ media: state })}::jsonb` })
      .where(eq(messages.id, messageId));
    return state;
  }

  async file(userId: string, messageId: string) {
    const [row] = await this.db
      .select({
        type: messages.type,
        payload: messages.payload,
        contentType: messageMedia.contentType,
        data: messageMedia.data,
      })
      .from(messageMedia)
      .innerJoin(messages, eq(messages.id, messageMedia.messageId))
      .where(and(eq(messages.id, messageId), eq(messages.userId, userId)))
      .limit(1);
    if (!row) throw new NotFoundException();
    const { contentType, inline } = servingType(row.type, row.contentType, row.data);
    const fallback = `${row.type}-${messageId.slice(0, 8)}`;
    return { contentType, inline, data: row.data, fileName: safeFileName(row.payload?.fileName, fallback) };
  }
}
