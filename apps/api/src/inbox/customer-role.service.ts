import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { messagingApi } from '@line/bot-sdk';
import { eq } from 'drizzle-orm';
import { AuditService } from '../auth/audit.service.js';
import type { Env } from '../config/env.js';
import { ConversationStatusService } from '../conversations/conversation-status.service.js';
import { DB, type Database } from '../db/database.module.js';
import { lineUsers } from '../db/schema.js';
import { LINE_MESSAGING_CLIENT } from '../line/line.constants.js';

export type RichMenuResult = 'linked' | 'unlinked' | 'not_configured' | 'failed';

/** Grants or removes customer access, and swaps the LINE rich menu to match. */
@Injectable()
export class CustomerRoleService {
  private readonly logger = new Logger(CustomerRoleService.name);
  private readonly richMenuId: string | undefined;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(LINE_MESSAGING_CLIENT) private readonly line: messagingApi.MessagingApiClient,
    private readonly status: ConversationStatusService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.richMenuId = config.get('CUSTOMER_RICH_MENU_ID', { infer: true });
  }

  async setRole(
    userId: string,
    role: 'CUSTOMER' | null,
    by: { adminId: string | null; ip?: string | null; via?: 'chat' | 'invite' },
  ): Promise<{ role: 'CUSTOMER' | null; richMenu: RichMenuResult }> {
    const [user] = await this.db
      .select({ role: lineUsers.role })
      .from(lineUsers)
      .where(eq(lineUsers.userId, userId))
      .limit(1);
    if (!user) throw new NotFoundException();

    if (user.role !== role) {
      await this.db
        .update(lineUsers)
        .set(
          role
            ? { role, roleGrantedById: by.adminId, roleGrantedAt: new Date() }
            : { role: null, roleGrantedById: null, roleGrantedAt: null },
        )
        .where(eq(lineUsers.userId, userId));
      await this.status.log(userId, by.adminId, role ? 'role_granted' : 'role_revoked', by.via ? { via: by.via } : null);
      await this.audit.log(role ? 'customer.role_granted' : 'customer.role_revoked', {
        actorId: by.adminId,
        targetId: userId,
        ip: by.ip,
      });
    }

    return { role, richMenu: await this.syncRichMenu(userId, role) };
  }

  private async syncRichMenu(userId: string, role: 'CUSTOMER' | null): Promise<RichMenuResult> {
    if (!this.richMenuId) return 'not_configured';
    try {
      if (role) {
        await this.line.linkRichMenuIdToUser(userId, this.richMenuId);
        return 'linked';
      }
      await this.line.unlinkRichMenuIdFromUser(userId);
      return 'unlinked';
    } catch (error) {
      // The role still applies; the menu can be re-linked by saving the role again
      this.logger.warn(`Rich menu ${role ? 'link' : 'unlink'} failed: ${(error as Error).message}`);
      return 'failed';
    }
  }
}
