import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../auth/audit.service.js';
import { generateTempPassword } from '../auth/crypto.js';
import { hashPassword } from '../auth/password.js';
import { DB, type Database } from '../db/database.module.js';
import { type Admin, admins, auditLogs, recoveryCodes } from '../db/schema.js';

const TEMP_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;

const listColumns = {
  id: admins.id,
  username: admins.username,
  displayName: admins.displayName,
  role: admins.role,
  isActive: admins.isActive,
  mustChangePassword: admins.mustChangePassword,
  totpEnabled: sql<boolean>`${admins.totpEnabledAt} is not null`,
  lastLoginAt: admins.lastLoginAt,
  createdAt: admins.createdAt,
};

@Injectable()
export class AdminsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.db.select(listColumns).from(admins).orderBy(admins.createdAt);
  }

  /** New admins get a one-time temporary password and must set their own password and 2FA. */
  async create(actor: Admin, input: { username: string; displayName: string }, ip: string) {
    const tempPassword = generateTempPassword();
    const [created] = await this.db
      .insert(admins)
      .values({
        username: input.username,
        displayName: input.displayName,
        role: 'ADMIN', // super admins are only created from the server env
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
        tempPasswordExpiresAt: new Date(Date.now() + TEMP_PASSWORD_TTL_MS),
        createdById: actor.id,
      })
      .onConflictDoNothing({ target: admins.username })
      .returning({ id: admins.id });

    if (!created) throw new ConflictException({ code: 'username_taken' });
    await this.audit.log('admin.created', { actorId: actor.id, targetId: created.id, ip });
    return { admin: await this.get(created.id), tempPassword };
  }

  async setActive(actor: Admin, id: string, isActive: boolean, ip: string) {
    await this.assertManageable(actor, id);
    await this.db
      .update(admins)
      .set({ isActive, ...(isActive ? {} : { tokenVersion: sql`${admins.tokenVersion} + 1` }) })
      .where(eq(admins.id, id));
    await this.audit.log(isActive ? 'admin.activated' : 'admin.deactivated', { actorId: actor.id, targetId: id, ip });
    return this.get(id);
  }

  async resetPassword(actor: Admin, id: string, ip: string) {
    await this.assertManageable(actor, id);
    const tempPassword = generateTempPassword();
    await this.db
      .update(admins)
      .set({
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
        tempPasswordExpiresAt: new Date(Date.now() + TEMP_PASSWORD_TTL_MS),
        tokenVersion: sql`${admins.tokenVersion} + 1`,
      })
      .where(eq(admins.id, id));
    await this.audit.log('admin.password_reset', { actorId: actor.id, targetId: id, ip });
    return { admin: await this.get(id), tempPassword };
  }

  /** For a lost phone: the admin enrols a new authenticator at next login. */
  async resetTotp(actor: Admin, id: string, ip: string) {
    await this.assertManageable(actor, id);
    await this.db.transaction(async (tx) => {
      await tx
        .update(admins)
        .set({
          totpSecretEnc: null,
          totpEnabledAt: null,
          totpLastUsedStep: null,
          tokenVersion: sql`${admins.tokenVersion} + 1`,
        })
        .where(eq(admins.id, id));
      await tx.delete(recoveryCodes).where(eq(recoveryCodes.adminId, id));
    });
    await this.audit.log('admin.2fa_reset', { actorId: actor.id, targetId: id, ip });
    return this.get(id);
  }

  auditLog(limit: number) {
    const actor = alias(admins, 'actor');
    const target = alias(admins, 'target');
    return this.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actor: actor.username,
        target: target.username,
        ip: auditLogs.ip,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(actor, eq(actor.id, auditLogs.actorId))
      .leftJoin(target, sql`${target.id}::text = ${auditLogs.targetId}`)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  private async get(id: string) {
    const [admin] = await this.db.select(listColumns).from(admins).where(eq(admins.id, id));
    if (!admin) throw new NotFoundException();
    return admin;
  }

  /** Super admins cannot lock themselves out, and no one manages another super admin from the web. */
  private async assertManageable(actor: Admin, id: string) {
    if (id === actor.id) throw new ForbiddenException({ code: 'cannot_manage_self' });
    const [target] = await this.db.select({ role: admins.role }).from(admins).where(eq(admins.id, id));
    if (!target) throw new NotFoundException();
    if (target.role === 'SUPER_ADMIN') throw new ForbiddenException({ code: 'cannot_manage_super_admin' });
  }
}
