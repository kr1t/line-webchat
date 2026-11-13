import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import type { Env } from '../config/env.js';
import { TOTP_ISSUER } from './constants.js';
import { decryptSecret, encryptSecret } from './crypto.js';

@Injectable()
export class TotpService {
  private readonly key: string;

  constructor(config: ConfigService<Env, true>) {
    this.key = config.get('TOTP_ENC_KEY', { infer: true });
  }

  /** New secret for enrolment: the encrypted copy is stored, the plain one goes to the QR code only. */
  async createEnrolment(username: string) {
    const secret = generateSecret();
    const uri = generateURI({ issuer: TOTP_ISSUER, label: username, secret });
    const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
    return { secret, encrypted: encryptSecret(secret, this.key), qrDataUrl };
  }

  /**
   * Checks a 6-digit code (±30s for clock drift). Codes at or before `lastUsedStep`
   * are rejected so an observed code cannot be replayed.
   */
  async check(encryptedSecret: string, code: string, lastUsedStep: number | null): Promise<number | null> {
    const result = await verify({
      secret: decryptSecret(encryptedSecret, this.key),
      token: code,
      epochTolerance: 30,
      ...(lastUsedStep !== null ? { afterTimeStep: lastUsedStep } : {}),
    });
    // otplib's shared verify() also covers HOTP; only TOTP results carry a timeStep
    return result.valid && 'timeStep' in result ? result.timeStep : null;
  }
}
