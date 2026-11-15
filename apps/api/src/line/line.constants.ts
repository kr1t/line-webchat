export const LINE_MESSAGING_CLIENT = Symbol('LINE_MESSAGING_CLIENT');
export const LINE_BLOB_CLIENT = Symbol('LINE_BLOB_CLIENT');

// Treat reply tokens as expired a bit early; sending falls back to push messages after this
export const REPLY_TOKEN_TTL_MS = 50_000;

// Re-fetch a user's LINE profile at most once a day
export const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;
