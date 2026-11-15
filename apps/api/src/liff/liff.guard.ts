import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { LIFF_COOKIE } from './liff.constants.js';
import { LiffSessionService } from './liff-session.service.js';

export type LiffRequest = FastifyRequest & { lineUserId?: string };

/** Customer pages opened in LINE: needs the cookie from POST /liff/session. */
@Injectable()
export class LiffGuard implements CanActivate {
  constructor(private readonly sessions: LiffSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<LiffRequest>();
    const userId = await this.sessions.verify(req.cookies?.[LIFF_COOKIE]);
    if (!userId) throw new UnauthorizedException({ code: 'liff_session_required' });
    req.lineUserId = userId;
    return true;
  }
}
