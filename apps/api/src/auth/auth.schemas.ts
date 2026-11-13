import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'username must be 3-32 characters: a-z, 0-9, . _ -');

export const passwordSchema = z.string().min(12, 'at least 12 characters').max(128);

export const loginBody = z.object({ username: usernameSchema, password: z.string().min(1).max(128) }).strict();
export type LoginBody = z.infer<typeof loginBody>;

export const changePasswordBody = z.object({ newPassword: passwordSchema }).strict();
export type ChangePasswordBody = z.infer<typeof changePasswordBody>;

// Either a 6-digit authenticator code or a recovery code like "k7mp-3xq2-h9tw"
export const codeBody = z
  .object({
    code: z
      .string()
      .trim()
      .toLowerCase()
      .transform((value) => value.replace(/\s+/g, ''))
      .pipe(z.string().regex(/^(\d{6}|[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4})$/, 'invalid code format')),
  })
  .strict();
export type CodeBody = z.infer<typeof codeBody>;

export const TOTP_CODE = /^\d{6}$/;
