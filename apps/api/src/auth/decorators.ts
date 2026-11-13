import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Admin } from '../db/schema.js';
import type { MfaStage } from './constants.js';

export const IS_PUBLIC = 'auth:public';
export const MFA_STAGES = 'auth:mfa-stages';
export const ROLES = 'auth:roles';
export const STEP_UP = 'auth:step-up';

/** No session needed (webhook, health, login). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Only reachable with a pending-login cookie in one of these stages. */
export const MfaStages = (...stages: MfaStage[]) => SetMetadata(MFA_STAGES, stages);

export const Roles = (...roles: Admin['role'][]) => SetMetadata(ROLES, roles);

/** Needs a 2FA code entered within the last few minutes (see POST /auth/step-up). */
export const RequireStepUp = () => SetMetadata(STEP_UP, true);

export type AuthedRequest = FastifyRequest & { admin?: Admin; mfaStage?: MfaStage };

export const CurrentAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext): Admin => {
  const admin = ctx.switchToHttp().getRequest<AuthedRequest>().admin;
  if (!admin) throw new Error('CurrentAdmin used on a route without authentication');
  return admin;
});
