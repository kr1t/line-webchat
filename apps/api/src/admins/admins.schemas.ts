import { z } from 'zod';
import { usernameSchema } from '../auth/auth.schemas.js';

export const createAdminBody = z
  .object({
    username: usernameSchema,
    displayName: z.string().trim().min(1).max(60),
  })
  .strict();
export type CreateAdminBody = z.infer<typeof createAdminBody>;

export const updateAdminBody = z.object({ isActive: z.boolean() }).strict();
export type UpdateAdminBody = z.infer<typeof updateAdminBody>;

export const adminIdSchema = z.uuid();

export const auditQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }).strict();
export type AuditQuery = z.infer<typeof auditQuery>;
