export const LIFF_COOKIE = 'lc_liff';
export const LIFF_TTL_SECONDS = 60 * 60;
export const LINE_ID_TOKEN_VERIFIER = Symbol('LINE_ID_TOKEN_VERIFIER');

export interface LineIdentity {
  userId: string;
  displayName: string | null;
  pictureUrl: string | null;
}

/** Checks a LIFF ID token with LINE and returns who it belongs to, or null if it is not valid. */
export type LineIdTokenVerifier = (idToken: string) => Promise<LineIdentity | null>;
