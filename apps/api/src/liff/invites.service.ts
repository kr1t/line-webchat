import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AttemptsService } from '../auth/attempts.service.js';
import { AuditService } from '../auth/audit.service.js';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../db/database.module.js';
import { type Admin, admins, lineUsers, type RoleInvite, roleInvites } from '../db/schema.js';
import { CustomerRoleService } from '../inbox/customer-role.service.js';
import type { CreateInviteBody } from './liff.schemas.js';

export type RedeemResult = 'granted' | 'pending' | 'already' | 'invalid' | 'expired' | 'used' | 'revoked' | 'wrong_user' | 'blocked';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Invite links that give the customer role:
 * - the link holds only a random 256-bit token; the database keeps its SHA-256
 * - one use, expires, can be revoked, optionally locked to one LINE user
 * - without a target user, an admin must approve after the link is used
 * - who opened it comes from a LINE-verified ID token, never from the page
 */
@Injectable()
export class InvitesService {
  private readonly liffId: string | undefined;
  private readonly webOrigin: string;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly roles: CustomerRoleService,
    private readonly attempts: AttemptsService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.liffId = config.get('LIFF_ID', { infer: true });
    this.webOrigin = new URL(config.get('WEB_ORIGIN', { infer: true })).origin;
  }

  async create(body: CreateInviteBody, actor: Admin, ip?: string) {
    if (body.targetUserId) {
      const [target] = await this.db
        .select({ userId: lineUsers.userId })
        .from(lineUsers)
        .where(eq(lineUsers.userId, body.targetUserId))
        .limit(1);
      if (!target) throw new BadRequestException({ code: 'unknown_user' });
    }
    const token = randomBytes(32).toString('base64url');
    const [invite] = await this.db
      .insert(roleInvites)
      .values({
        tokenHash: hashToken(token),
        targetUserId: body.targetUserId,
        // An invite anyone could open must be approved by a person afterwards
        requireApproval: body.targetUserId ? body.requireApproval : true,
        expiresAt: new Date(Date.now() + body.expiresInHours * 3600_000),
        createdById: actor.id,
      })
      .returning();
    await this.audit.log('invite.created', { actorId: actor.id, targetId: invite.id, ip });
    // The token is shown once, here; it cannot be read back later
    return { id: invite.id, url: this.url(token), expiresAt: invite.expiresAt, requireApproval: invite.requireApproval };
  }

  async list() {
    const creator = alias(admins, 'creator');
    const target = alias(lineUsers, 'target');
    const user = alias(lineUsers, 'used_by');
    const rows = await this.db
      .select({
        invite: roleInvites,
        createdByName: creator.displayName,
        targetName: target.displayName,
        usedByName: user.displayName,
      })
      .from(roleInvites)
      .leftJoin(creator, eq(creator.id, roleInvites.createdById))
      .leftJoin(target, eq(target.userId, roleInvites.targetUserId))
      .leftJoin(user, eq(user.userId, roleInvites.usedByUserId))
      .orderBy(desc(roleInvites.createdAt))
      .limit(50);
    const now = Date.now();
    return rows.map(({ invite, ...names }) => ({
      id: invite.id,
      status: inviteStatus(invite, now),
      targetUserId: invite.targetUserId,
      requireApproval: invite.requireApproval,
      expiresAt: invite.expiresAt,
      usedAt: invite.usedAt,
      usedByUserId: invite.usedByUserId,
      createdAt: invite.createdAt,
      ...names,
    }));
  }

  async revoke(id: string, actor: Admin, ip?: string) {
    const updated = await this.db
      .update(roleInvites)
      .set({ revokedAt: new Date(), revokedById: actor.id })
      .where(and(eq(roleInvites.id, id), isNull(roleInvites.revokedAt), or(isNull(roleInvites.usedAt), isNull(roleInvites.approvedAt))))
      .returning({ id: roleInvites.id });
    if (updated.length === 0) throw new ConflictException({ code: 'not_revocable' });
    await this.audit.log('invite.revoked', { actorId: actor.id, targetId: id, ip });
  }

  async approve(id: string, actor: Admin, ip?: string) {
    const [invite] = await this.db
      .update(roleInvites)
      .set({ approvedAt: new Date(), approvedById: actor.id })
      .where(
        and(
          eq(roleInvites.id, id),
          sql`${roleInvites.usedAt} is not null`,
          isNull(roleInvites.approvedAt),
          isNull(roleInvites.revokedAt),
        ),
      )
      .returning();
    if (!invite?.usedByUserId) {
      const [exists] = await this.db.select({ id: roleInvites.id }).from(roleInvites).where(eq(roleInvites.id, id));
      if (!exists) throw new NotFoundException();
      throw new ConflictException({ code: 'not_pending' });
    }
    await this.audit.log('invite.approved', { actorId: actor.id, targetId: id, ip });
    return this.roles.setRole(invite.usedByUserId, 'CUSTOMER', { adminId: actor.id, ip, via: 'invite' });
  }

  /** Called from the LIFF page with the user LINE vouched for. */
  async redeem(token: string, userId: string, ip?: string): Promise<{ result: RedeemResult }> {
    const keys = [`invite-ip:${ip ?? 'unknown'}`, `invite-user:${userId}`];
    if (await this.attempts.isBlocked(keys)) return { result: 'blocked' };

    const [user] = await this.db.select({ role: lineUsers.role }).from(lineUsers).where(eq(lineUsers.userId, userId)).limit(1);
    if (user?.role === 'CUSTOMER') return { result: 'already' };

    const tokenHash = hashToken(token);
    // One statement: two people opening the same link at once cannot both use it
    const [claimed] = await this.db
      .update(roleInvites)
      .set({ usedAt: new Date(), usedByUserId: userId })
      .where(
        and(
          eq(roleInvites.tokenHash, tokenHash),
          isNull(roleInvites.usedAt),
          isNull(roleInvites.revokedAt),
          gt(roleInvites.expiresAt, new Date()),
          or(isNull(roleInvites.targetUserId), eq(roleInvites.targetUserId, userId)),
        ),
      )
      .returning();

    if (!claimed) {
      const result = await this.whyNot(tokenHash, userId);
      // Someone re-opening their own already-used link is not an attack
      if (result !== 'used') await this.attempts.record(keys, false);
      return { result };
    }

    await this.audit.log('invite.redeemed', { actorId: null, targetId: claimed.id, ip });
    if (claimed.requireApproval) return { result: 'pending' };
    await this.db.update(roleInvites).set({ approvedAt: new Date() }).where(eq(roleInvites.id, claimed.id));
    await this.roles.setRole(userId, 'CUSTOMER', { adminId: claimed.createdById, ip, via: 'invite' });
    return { result: 'granted' };
  }

  /** Whether this user has used an invite that still waits for approval. */
  async hasPending(userId: string) {
    const [row] = await this.db
      .select({ id: roleInvites.id })
      .from(roleInvites)
      .where(and(eq(roleInvites.usedByUserId, userId), isNull(roleInvites.approvedAt), isNull(roleInvites.revokedAt)))
      .limit(1);
    return !!row;
  }

  private async whyNot(tokenHash: string, userId: string): Promise<RedeemResult> {
    const [invite] = await this.db.select().from(roleInvites).where(eq(roleInvites.tokenHash, tokenHash)).limit(1);
    if (!invite) return 'invalid';
    if (invite.revokedAt) return 'revoked';
    if (invite.usedAt) return invite.usedByUserId === userId ? (invite.approvedAt ? 'already' : 'pending') : 'used';
    if (invite.expiresAt.getTime() <= Date.now()) return 'expired';
    return 'wrong_user';
  }

  private url(token: string) {
    // LIFF opens /liff + the path after the LIFF id; outside LINE the same page asks to open it in LINE
    return this.liffId
      ? `https://liff.line.me/${this.liffId}/join?invite=${token}`
      : `${this.webOrigin}/liff/join?invite=${token}`;
  }
}

export function inviteStatus(invite: RoleInvite, now: number) {
  if (invite.revokedAt) return 'revoked' as const;
  if (invite.usedAt) return invite.approvedAt ? ('granted' as const) : ('pending_approval' as const);
  if (invite.expiresAt.getTime() <= now) return 'expired' as const;
  return 'unused' as const;
}
