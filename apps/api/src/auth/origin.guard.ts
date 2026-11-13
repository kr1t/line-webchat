import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { Env } from '../config/env.js';

const SKIP_ORIGIN_CHECK = 'auth:skip-origin-check';

/** For server-to-server endpoints authenticated another way (the LINE webhook). */
export const SkipOriginCheck = () => SetMetadata(SKIP_ORIGIN_CHECK, true);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence on top of SameSite cookies: state-changing requests must come
 * from our own web origin.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService<Env, true>,
  ) {
    this.allowedOrigin = new URL(config.get('WEB_ORIGIN', { infer: true })).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_ORIGIN_CHECK, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const origin = req.headers.origin;
    if (origin === this.allowedOrigin) return true;
    if (!origin && req.headers['sec-fetch-site'] === 'same-origin') return true;
    throw new ForbiddenException({ code: 'bad_origin' });
  }
}
