import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { type Admin, admins, recoveryCodes } from '../db/schema.js';
import { AttemptsService } from './attempts.service.js';
import { AuditService } from './audit.service.js';
import { type MfaStage, RECOVERY_CODE_COUNT } from './constants.js';
import { generateRecoveryCode } from './crypto.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password.js';
import { TOTP_CODE } from './auth.schemas.js';
import { TotpService } from './totp.service.js';

const tooManyAttempts = () =>
  new HttpException({ code: 'too_many_attempts' }, HttpStatus.TOO_MANY_REQUESTS);

export function nextStage(admin: Admin): MfaStage {
  if (admin.mustChangePassword) return 'change_password';
  if (!admin.totpEnabledAt) return 'setup_2fa';
  return 'verify_2fa';
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly attempts: AttemptsService,
    private readonly audit: AuditService,
    private readonly totp: TotpService,
  ) {}

  /** Step 1: username + password. Never says which of the two was wrong. */
  async login(username: string, password: string, ip: string) {
    const keys = [`user:${username}`, `ip:${ip}`];
    if (await this.attempts.isBlocked(keys)) {
      await this.audit.log('login.blocked', { ip });
      throw tooManyAttempts();
    }

    const [admin] = await this.db.select().from(admins).where(eq(admins.username, username)).limit(1);
    if (!admin) await burnPasswordCheck(password);

    const tempExpired =
      admin?.mustChangePassword && admin.tempPasswordExpiresAt && admin.tempPasswordExpiresAt < new Date();
    const valid = !!admin && admin.isActive && !tempExpired && (await verifyPassword(admin.passwordHash, password));

    if (!valid) {
      await this.attempts.record(keys, false);
      await this.audit.log('login.failed', { targetId: admin?.id, ip });
      throw new UnauthorizedException({ code: 'invalid_credentials' });
    }
    return admin;
  }

  async changePassword(admin: Admin, newPassword: string, ip: string) {
    if (newPassword.toLowerCase().includes(admin.username)) {
      throw new BadRequestException({ code: 'password_contains_username' });
    }
    if (await verifyPassword(admin.passwordHash, newPassword)) {
      throw new BadRequestException({ code: 'password_reused' });
    }
    const [updated] = await this.db
      .update(admins)
      .set({
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        tempPasswordExpiresAt: null,
        tokenVersion: sql`${admins.tokenVersion} + 1`,
      })
      .where(eq(admins.id, admin.id))
      .returning();
    await this.audit.log('password.changed', { actorId: admin.id, targetId: admin.id, ip });
    return updated;
  }

  /** Starts (or restarts) authenticator enrolment; the secret only becomes active after `enableTotp`. */
  async startTotpSetup(admin: Admin) {
    if (admin.totpEnabledAt) throw new ConflictException({ code: '2fa_already_enabled' });
    const enrolment = await this.totp.createEnrolment(admin.username);
    await this.db.update(admins).set({ totpSecretEnc: enrolment.encrypted }).where(eq(admins.id, admin.id));
    return { qrDataUrl: enrolment.qrDataUrl, secret: enrolment.secret };
  }

  async enableTotp(admin: Admin, code: string, ip: string) {
    if (admin.totpEnabledAt) throw new ConflictException({ code: '2fa_already_enabled' });
    if (!admin.totpSecretEnc) throw new BadRequestException({ code: '2fa_setup_not_started' });
    await this.assertNotBlocked(admin);

    const step = TOTP_CODE.test(code) ? await this.totp.check(admin.totpSecretEnc, code, null) : null;
    if (step === null) return this.failCode(admin);

    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    const hashes = await Promise.all(codes.map((c) => hashPassword(c)));

    await this.db.transaction(async (tx) => {
      await tx
        .update(admins)
        .set({ totpEnabledAt: new Date(), totpLastUsedStep: step })
        .where(eq(admins.id, admin.id));
      await tx.delete(recoveryCodes).where(eq(recoveryCodes.adminId, admin.id));
      await tx.insert(recoveryCodes).values(hashes.map((codeHash) => ({ adminId: admin.id, codeHash })));
    });

    await this.attempts.record([`2fa:${admin.id}`], true);
    await this.audit.log('2fa.enabled', { actorId: admin.id, targetId: admin.id, ip });
    await this.markLoggedIn(admin, ip);
    return codes;
  }

  /** Step 2 for enrolled admins: authenticator code or a single-use recovery code. */
  async verifySecondFactor(admin: Admin, code: string, ip: string) {
    await this.assertNotBlocked(admin);
    const ok = TOTP_CODE.test(code) ? await this.useTotpCode(admin, code) : await this.useRecoveryCode(admin, code, ip);
    if (!ok) return this.failCode(admin);

    await this.attempts.record([`2fa:${admin.id}`], true);
    await this.markLoggedIn(admin, ip);
  }

  /** Re-confirms an already signed-in admin with a fresh authenticator code. */
  async stepUp(admin: Admin, code: string, ip: string) {
    await this.assertNotBlocked(admin);
    if (!TOTP_CODE.test(code) || !(await this.useTotpCode(admin, code))) return this.failCode(admin);
    await this.attempts.record([`2fa:${admin.id}`], true);
    await this.audit.log('step_up', { actorId: admin.id, ip });
  }

  private async useTotpCode(admin: Admin, code: string): Promise<boolean> {
    if (!admin.totpSecretEnc) return false;
    const step = await this.totp.check(admin.totpSecretEnc, code, admin.totpLastUsedStep);
    if (step === null) return false;
    // Conditional update: two requests racing with the same code cannot both succeed
    const claimed = await this.db
      .update(admins)
      .set({ totpLastUsedStep: step })
      .where(and(eq(admins.id, admin.id), or(isNull(admins.totpLastUsedStep), lt(admins.totpLastUsedStep, step))))
      .returning({ id: admins.id });
    return claimed.length === 1;
  }

  private async useRecoveryCode(admin: Admin, code: string, ip: string): Promise<boolean> {
    const unused = await this.db
      .select({ id: recoveryCodes.id, codeHash: recoveryCodes.codeHash })
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.adminId, admin.id), isNull(recoveryCodes.usedAt)));

    for (const candidate of unused) {
      if (!(await verifyPassword(candidate.codeHash, code))) continue;
      const claimed = await this.db
        .update(recoveryCodes)
        .set({ usedAt: new Date() })
        .where(and(eq(recoveryCodes.id, candidate.id), isNull(recoveryCodes.usedAt)))
        .returning({ id: recoveryCodes.id });
      if (claimed.length === 1) {
        await this.audit.log('2fa.recovery_code_used', { actorId: admin.id, targetId: admin.id, ip });
        return true;
      }
    }
    return false;
  }

  private async assertNotBlocked(admin: Admin) {
    if (await this.attempts.isBlocked([`2fa:${admin.id}`])) throw tooManyAttempts();
  }

  private async failCode(admin: Admin): Promise<never> {
    await this.attempts.record([`2fa:${admin.id}`], false);
    throw new UnauthorizedException({ code: 'invalid_code' });
  }

  private async markLoggedIn(admin: Admin, ip: string) {
    await this.db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id));
    await this.audit.log('login.success', { actorId: admin.id, ip });
  }
}
