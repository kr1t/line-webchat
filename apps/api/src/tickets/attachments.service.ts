import type { Readable } from 'node:stream';
import { ConflictException, Inject, Injectable, Logger, NotFoundException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { messagingApi } from '@line/bot-sdk';
import { and, asc, count, eq, gt, isNull } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { ticketAttachments } from '../db/schema.js';
import { LINE_BLOB_CLIENT } from '../line/line.constants.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_TICKET = 10;
// Pictures sent while writing a report are kept this long waiting for the description
const DRAFT_WINDOW_MS = 30 * 60_000;

const metaColumns = {
  id: ticketAttachments.id,
  contentType: ticketAttachments.contentType,
  size: ticketAttachments.size,
  source: ticketAttachments.source,
  createdAt: ticketAttachments.createdAt,
};

/** The real type from the first bytes; the file name or a header from the client is never trusted. */
export function sniffImage(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.length >= 6 && /^GIF8[79]a$/.test(data.subarray(0, 6).toString('latin1'))) return 'image/gif';
  if (data.length >= 12 && data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

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

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(LINE_BLOB_CLIENT) private readonly blob: messagingApi.MessagingApiBlobClient,
  ) {}

  /**
   * Downloads a picture the customer sent in the LINE chat (LINE deletes content after a while)
   * and keeps it, either on a ticket or as a draft for the report being written.
   * Returns how many pictures that ticket/draft now has, or null if the picture was not kept.
   */
  async saveFromLine(ownerId: string, lineMessageId: string, ticketId: string | null): Promise<number | null> {
    const current = await this.countFor(ownerId, ticketId);
    if (current >= MAX_IMAGES_PER_TICKET) return null;
    let data: Buffer | null;
    try {
      data = await readLimited(await this.blob.getMessageContent(lineMessageId), MAX_IMAGE_BYTES);
    } catch (error) {
      this.logger.warn(`Could not download image from LINE: ${(error as Error).message}`);
      return null;
    }
    const contentType = data ? sniffImage(data) : null;
    if (!data || !contentType) return null;

    const inserted = await this.db
      .insert(ticketAttachments)
      .values({ ticketId, ownerId, source: 'line', contentType, size: data.length, data, lineMessageId })
      .onConflictDoNothing()
      .returning({ id: ticketAttachments.id });
    return inserted.length ? current + 1 : current;
  }

  /** A picture uploaded from the LIFF page (already resized in the browser). */
  async saveUpload(ownerId: string, ticketId: string, data: Buffer) {
    if (data.length > MAX_IMAGE_BYTES) throw new PayloadTooLargeException({ code: 'image_too_large' });
    const contentType = sniffImage(data);
    if (!contentType) throw new UnsupportedMediaTypeException({ code: 'not_an_image' });
    if ((await this.countFor(ownerId, ticketId)) >= MAX_IMAGES_PER_TICKET) throw new ConflictException({ code: 'too_many_images' });
    const [row] = await this.db
      .insert(ticketAttachments)
      .values({ ticketId, ownerId, source: 'liff', contentType, size: data.length, data })
      .returning(metaColumns);
    return row;
  }

  /** Moves the pictures sent while writing the report onto the new ticket. */
  async claimDrafts(ownerId: string, ticketId: string) {
    const moved = await this.db
      .update(ticketAttachments)
      .set({ ticketId })
      .where(
        and(
          eq(ticketAttachments.ownerId, ownerId),
          isNull(ticketAttachments.ticketId),
          gt(ticketAttachments.createdAt, new Date(Date.now() - DRAFT_WINDOW_MS)),
        ),
      )
      .returning({ id: ticketAttachments.id });
    return moved.length;
  }

  /** Drops unused drafts, e.g. when the customer cancels the report. */
  async discardDrafts(ownerId: string) {
    await this.db.delete(ticketAttachments).where(and(eq(ticketAttachments.ownerId, ownerId), isNull(ticketAttachments.ticketId)));
  }

  /** Pictures added to a ticket in the last few seconds (several pictures arrive as one batch). */
  async addedSince(ticketId: string, ms: number) {
    const [row] = await this.db
      .select({ n: count() })
      .from(ticketAttachments)
      .where(and(eq(ticketAttachments.ticketId, ticketId), gt(ticketAttachments.createdAt, new Date(Date.now() - ms))));
    return row.n;
  }

  list(ticketId: string) {
    return this.db.select(metaColumns).from(ticketAttachments).where(eq(ticketAttachments.ticketId, ticketId)).orderBy(asc(ticketAttachments.createdAt));
  }

  async file(ticketId: string, id: string) {
    const [row] = await this.db
      .select({ contentType: ticketAttachments.contentType, data: ticketAttachments.data })
      .from(ticketAttachments)
      .where(and(eq(ticketAttachments.id, id), eq(ticketAttachments.ticketId, ticketId)))
      .limit(1);
    if (!row) throw new NotFoundException();
    return row;
  }

  private async countFor(ownerId: string, ticketId: string | null) {
    const [row] = await this.db
      .select({ n: count() })
      .from(ticketAttachments)
      .where(
        ticketId
          ? eq(ticketAttachments.ticketId, ticketId)
          : and(
              eq(ticketAttachments.ownerId, ownerId),
              isNull(ticketAttachments.ticketId),
              gt(ticketAttachments.createdAt, new Date(Date.now() - DRAFT_WINDOW_MS)),
            ),
      );
    return row.n;
  }
}
