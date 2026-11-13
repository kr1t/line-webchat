import { Inject, Injectable } from '@nestjs/common';
import { DB, type Database } from '../db/database.module.js';
import { auditLogs } from '../db/schema.js';

export type AuditAction =
  | 'login.success'
  | 'login.failed'
  | 'login.blocked'
  | 'password.changed'
  | '2fa.enabled'
  | '2fa.recovery_code_used'
  | 'logout'
  | 'step_up'
  | 'admin.created'
  | 'admin.deactivated'
  | 'admin.activated'
  | 'admin.password_reset'
  | 'admin.2fa_reset';

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async log(action: AuditAction, entry: { actorId?: string | null; targetId?: string | null; ip?: string | null }) {
    await this.db.insert(auditLogs).values({
      action,
      actorId: entry.actorId ?? null,
      targetId: entry.targetId ?? null,
      ip: entry.ip ?? null,
    });
  }
}
