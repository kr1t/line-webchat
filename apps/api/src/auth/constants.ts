export const SESSION_COOKIE = 'lc_session';
export const MFA_COOKIE = 'lc_mfa';
export const STEP_UP_COOKIE = 'lc_sudo';

export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const MFA_TTL_SECONDS = 10 * 60;
// After re-entering a 2FA code, sensitive actions are allowed for this long
export const STEP_UP_TTL_SECONDS = 5 * 60;

export const MAX_FAILED_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export const RECOVERY_CODE_COUNT = 10;
export const TOTP_ISSUER = 'LineChatbot';

/** What the signed-in-but-not-yet-verified admin must do next. */
export type MfaStage = 'change_password' | 'setup_2fa' | 'verify_2fa';
