import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AuditService } from '../auth/audit.service.js';
import { ConversationStatusService } from '../conversations/conversation-status.service.js';
import { DB, type Database } from '../db/database.module.js';
import { lineUsers } from '../db/schema.js';
import { RichMenuService } from '../rich-menu/rich-menu.service.js';

export type RichMenuResult = 'linked' | 'unlinked' | 'failed';

/** Grants or removes customer access, and swaps the LINE rich menu to match. */
@Injectable()
export class CustomerRoleService {
  private readonly logger = new Logger(CustomerRoleService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly richMenu: RichMenuService,
    private readonly status: ConversationStatusService,
    private readonly audit: AuditService,
  ) {}

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
    try {
      if (role) {
        await this.richMenu.link(userId);
        return 'linked';
      }
      await this.richMenu.unlink(userId);
      return 'unlinked';
    } catch (error) {
      // The role still applies; the menu can be re-linked by saving the role again
      this.logger.warn(`Rich menu ${role ? 'link' : 'unlink'} failed: ${(error as Error).message}`);
      return 'failed';
    }
  }
}
