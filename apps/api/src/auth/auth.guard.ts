import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import { DB, type Database } from '../db/database.module.js';
import { type Admin, admins } from '../db/schema.js';
import { MFA_COOKIE, type MfaStage, SESSION_COOKIE, STEP_UP_COOKIE } from './constants.js';
import { type AuthedRequest, IS_PUBLIC, MFA_STAGES, STEP_UP } from './decorators.js';
import { nextStage } from './auth.service.js';
import { TokenService } from './token.service.js';

/**
 * Global guard: every route needs a full session unless it is marked @Public().
 * Routes marked @MfaStages() instead need the short-lived pending-login cookie.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const stages = this.reflector.getAllAndOverride<MfaStage[] | undefined>(MFA_STAGES, targets);
    if (stages) {
      const claims = await this.tokens.verify('mfa', req.cookies?.[MFA_COOKIE]);
      const admin = claims && (await this.loadAdmin(claims.sub, claims.ver));
      // The stage in the token must still match the account's real state
      if (!admin || !claims.stage || !stages.includes(claims.stage) || nextStage(admin) !== claims.stage) {
        throw new UnauthorizedException({ code: 'login_expired' });
      }
      req.admin = admin;
      req.mfaStage = claims.stage;
      return true;
    }

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const claims = await this.tokens.verify('session', req.cookies?.[SESSION_COOKIE]);
    const admin = claims && (await this.loadAdmin(claims.sub, claims.ver));
    if (!admin || admin.mustChangePassword || !admin.totpEnabledAt) {
      throw new UnauthorizedException({ code: 'unauthenticated' });
    }
    req.admin = admin;

    if (this.reflector.getAllAndOverride<boolean>(STEP_UP, targets)) {
      const stepUp = await this.tokens.verify('step-up', req.cookies?.[STEP_UP_COOKIE]);
      if (!stepUp || stepUp.sub !== admin.id || stepUp.ver !== admin.tokenVersion) {
        throw new ForbiddenException({ code: 'step_up_required' });
      }
    }
    return true;
  }

  private async loadAdmin(id: string, version: number): Promise<Admin | null> {
    const [admin] = await this.db.select().from(admins).where(eq(admins.id, id)).limit(1);
    if (!admin || !admin.isActive || admin.tokenVersion !== version) return null;
    return admin;
  }
}
