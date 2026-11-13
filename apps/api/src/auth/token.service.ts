import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';
import type { FastifyReply } from 'fastify';
import type { Env } from '../config/env.js';
import type { Admin } from '../db/schema.js';
import {
  MFA_COOKIE,
  MFA_TTL_SECONDS,
  type MfaStage,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  STEP_UP_COOKIE,
  STEP_UP_TTL_SECONDS,
} from './constants.js';

const ISSUER = 'linechatbot-api';
type Audience = 'session' | 'mfa' | 'step-up';

const TTL: Record<Audience, number> = {
  session: SESSION_TTL_SECONDS,
  mfa: MFA_TTL_SECONDS,
  'step-up': STEP_UP_TTL_SECONDS,
};

export interface TokenClaims {
  sub: string;
  ver: number;
  stage?: MfaStage;
}

@Injectable()
export class TokenService {
  private readonly key: Uint8Array;
  private readonly secureCookies: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.key = new TextEncoder().encode(config.get('JWT_SECRET', { infer: true }));
    this.secureCookies = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  async sign(audience: Audience, admin: Pick<Admin, 'id' | 'tokenVersion'>, stage?: MfaStage) {
    const ttl = TTL[audience];
    return new SignJWT({ ver: admin.tokenVersion, ...(stage ? { stage } : {}) })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(admin.id)
      .setIssuer(ISSUER)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(this.key);
  }

  async verify(audience: Audience, token: string | undefined): Promise<TokenClaims | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience,
      });
      if (typeof payload.sub !== 'string' || typeof payload.ver !== 'number') return null;
      return { sub: payload.sub, ver: payload.ver, stage: payload.stage as MfaStage | undefined };
    } catch {
      return null;
    }
  }

  async setSession(reply: FastifyReply, admin: Pick<Admin, 'id' | 'tokenVersion'>) {
    reply.setCookie(SESSION_COOKIE, await this.sign('session', admin), this.cookieOptions(SESSION_TTL_SECONDS));
    reply.clearCookie(MFA_COOKIE, this.cookieOptions(0));
  }

  async setMfa(reply: FastifyReply, admin: Pick<Admin, 'id' | 'tokenVersion'>, stage: MfaStage) {
    reply.setCookie(MFA_COOKIE, await this.sign('mfa', admin, stage), this.cookieOptions(MFA_TTL_SECONDS));
  }

  async setStepUp(reply: FastifyReply, admin: Pick<Admin, 'id' | 'tokenVersion'>) {
    reply.setCookie(STEP_UP_COOKIE, await this.sign('step-up', admin), this.cookieOptions(STEP_UP_TTL_SECONDS));
  }

  clearAll(reply: FastifyReply) {
    for (const name of [SESSION_COOKIE, MFA_COOKIE, STEP_UP_COOKIE]) reply.clearCookie(name, this.cookieOptions(0));
  }

  private cookieOptions(maxAge: number) {
    return { httpOnly: true, secure: this.secureCookies, sameSite: 'lax' as const, path: '/', maxAge };
  }
}
