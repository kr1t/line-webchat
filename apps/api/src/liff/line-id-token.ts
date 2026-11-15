import { Logger } from '@nestjs/common';
import type { LineIdentity, LineIdTokenVerifier } from './liff.constants.js';

const logger = new Logger('LineIdToken');

/**
 * LINE's verify endpoint checks the signature, expiry and that the token was issued
 * for our LINE Login channel (client_id), so a token from another app is rejected.
 */
export function createLineIdTokenVerifier(channelId: string | undefined): LineIdTokenVerifier {
  return async (idToken: string): Promise<LineIdentity | null> => {
    if (!channelId) return null;
    try {
      const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { sub?: unknown; name?: unknown; picture?: unknown; aud?: unknown };
      if (typeof body.sub !== 'string' || !/^U[0-9a-f]{32}$/.test(body.sub) || body.aud !== channelId) return null;
      return {
        userId: body.sub,
        displayName: typeof body.name === 'string' ? body.name : null,
        pictureUrl: typeof body.picture === 'string' ? body.picture : null,
      };
    } catch (error) {
      logger.warn(`ID token check failed: ${(error as Error).message}`);
      return null;
    }
  };
}
