import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';
import type { FastifyReply } from 'fastify';
import type { Env } from '../config/env.js';
import { LIFF_COOKIE, LIFF_TTL_SECONDS } from './liff.constants.js';

const ISSUER = 'linechatbot-api';
// A different audience from admin sessions: a customer cookie can never pass as an admin one
const AUDIENCE = 'liff';

@Injectable()
export class LiffSessionService {
  private readonly key: Uint8Array;
  private readonly secure: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.key = new TextEncoder().encode(config.get('JWT_SECRET', { infer: true }));
    this.secure = config.get('NODE_ENV', { infer: true }) === 'production' || Boolean(process.env.VERCEL);
  }

  sign(userId: string) {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${LIFF_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verify(token: string | undefined): Promise<string | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }

  async set(reply: FastifyReply, userId: string) {
    reply.setCookie(LIFF_COOKIE, await this.sign(userId), {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: LIFF_TTL_SECONDS,
    });
  }
}
