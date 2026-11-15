import { readFile } from 'node:fs/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HTTPFetchError, messagingApi } from '@line/bot-sdk';
import { eq, isNotNull } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../db/database.module.js';
import { lineUsers, settings } from '../db/schema.js';
import { LINE_BLOB_CLIENT, LINE_MESSAGING_CLIENT } from '../line/line.constants.js';

const KEY = 'customer_rich_menu';
const IMAGE = new URL('../../assets/rich-menu-customer.png', import.meta.url);
const BULK_LIMIT = 500;

const third = Math.round(2500 / 3);
const area = (x: number, width: number, data: string, label: string): messagingApi.RichMenuArea => ({
  bounds: { x, y: 0, width, height: 843 },
  action: { type: 'postback', data, displayText: label, label },
});

export const CUSTOMER_MENU: messagingApi.RichMenuRequest = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: 'tickget customer',
  chatBarText: 'เมนู',
  areas: [
    area(0, third, 'a=report', 'แจ้งปัญหา'),
    area(third, third, 'a=status', 'ติดตามสถานะ'),
    area(third * 2, 2500 - third * 2, 'a=talk', 'คุยกับทีม'),
  ],
};

export interface RichMenuStatus {
  id: string | null;
  source: 'env' | 'auto' | null;
}

const isNotFound = (error: unknown) => error instanceof HTTPFetchError && (error.status === 404 || error.status === 400);

/**
 * The menu customers see (แจ้งปัญหา / ติดตามสถานะ / คุยกับทีม).
 * Created on LINE the first time it is needed and remembered in the database,
 * so no environment variable has to be set. CUSTOMER_RICH_MENU_ID still wins when present.
 */
@Injectable()
export class RichMenuService {
  private readonly logger = new Logger(RichMenuService.name);
  private readonly fromEnv: string | undefined;
  private creating: Promise<string> | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(LINE_MESSAGING_CLIENT) private readonly line: messagingApi.MessagingApiClient,
    @Inject(LINE_BLOB_CLIENT) private readonly blob: messagingApi.MessagingApiBlobClient,
    config: ConfigService<Env, true>,
  ) {
    this.fromEnv = config.get('CUSTOMER_RICH_MENU_ID', { infer: true });
  }

  async status(): Promise<RichMenuStatus> {
    if (this.fromEnv) return { id: this.fromEnv, source: 'env' };
    const stored = await this.stored();
    return { id: stored, source: stored ? 'auto' : null };
  }

  /** Links the menu for one customer, creating it first if there is none (or it was deleted on LINE). */
  async link(userId: string): Promise<void> {
    const id = await this.ensure();
    try {
      await this.line.linkRichMenuIdToUser(userId, id);
    } catch (error) {
      if (this.fromEnv || !isNotFound(error)) throw error;
      // Someone deleted the menu in LINE Official Account Manager: make a new one and retry once
      this.logger.warn('Customer rich menu is gone on LINE, creating it again');
      await this.forget(id);
      await this.line.linkRichMenuIdToUser(userId, await this.ensure());
    }
  }

  async unlink(userId: string): Promise<void> {
    await this.line.unlinkRichMenuIdFromUser(userId);
  }

  /** Makes a fresh menu (e.g. after changing the image), moves every customer to it, removes the old one. */
  async rebuild(): Promise<RichMenuStatus & { linked: number }> {
    const old = await this.stored();
    if (old) await this.forget(old);
    const id = await this.ensure();
    const linked = await this.linkAllCustomers(id);
    if (old && old !== id) await this.line.deleteRichMenu(old).catch(() => undefined);
    return { id, source: this.fromEnv ? 'env' : 'auto', linked };
  }

  private async ensure(): Promise<string> {
    if (this.fromEnv) return this.fromEnv;
    const stored = await this.stored();
    if (stored) return stored;
    // Several requests at once share one creation
    this.creating ??= this.create().finally(() => (this.creating = null));
    return this.creating;
  }

  private async create(): Promise<string> {
    const { richMenuId } = await this.line.createRichMenu(CUSTOMER_MENU);
    try {
      const image = await readFile(IMAGE);
      await this.blob.setRichMenuImage(richMenuId, new Blob([new Uint8Array(image)], { type: 'image/png' }));
    } catch (error) {
      // A menu without an image cannot be linked; clean up and let the caller report it
      await this.line.deleteRichMenu(richMenuId).catch(() => undefined);
      throw error;
    }
    await this.db
      .insert(settings)
      .values({ key: KEY, value: { id: richMenuId } })
      .onConflictDoUpdate({ target: settings.key, set: { value: { id: richMenuId } } });
    this.logger.log(`Created customer rich menu ${richMenuId}`);
    // Customers who got the role before the menu existed get it now
    await this.linkAllCustomers(richMenuId);
    return richMenuId;
  }

  private async linkAllCustomers(richMenuId: string): Promise<number> {
    const customers = await this.db
      .select({ userId: lineUsers.userId })
      .from(lineUsers)
      .where(isNotNull(lineUsers.role));
    for (let i = 0; i < customers.length; i += BULK_LIMIT) {
      const userIds = customers.slice(i, i + BULK_LIMIT).map((c) => c.userId);
      await this.line.linkRichMenuIdToUsers({ richMenuId, userIds }).catch((error: unknown) => {
        this.logger.warn(`Bulk rich menu link failed: ${(error as Error).message}`);
      });
    }
    return customers.length;
  }

  private async stored(): Promise<string | null> {
    const [row] = await this.db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
    const id = (row?.value as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' ? id : null;
  }

  private async forget(id: string) {
    const current = await this.stored();
    if (current === id) await this.db.delete(settings).where(eq(settings.key, KEY));
  }
}
