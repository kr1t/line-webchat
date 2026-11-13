import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateSignature } from '@line/bot-sdk';
import type { RawBodyRequest } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Env } from '../config/env.js';

/** Rejects any webhook call that is not signed with our channel secret. */
@Injectable()
export class LineSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<FastifyRequest>>();
    const signature = req.headers['x-line-signature'];

    if (typeof signature !== 'string' || !signature || !req.rawBody) {
      throw new UnauthorizedException();
    }

    const secret = this.config.get('LINE_CHANNEL_SECRET', { infer: true });
    if (!validateSignature(req.rawBody, secret, signature)) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
