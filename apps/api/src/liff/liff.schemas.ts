import { z } from 'zod';
import { SEVERITIES } from '../tickets/sla.js';

export const liffSessionBody = z.object({ idToken: z.string().min(10).max(4096) }).strict();
export type LiffSessionBody = z.infer<typeof liffSessionBody>;

export const redeemBody = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'invalid invite') }).strict();
export type RedeemBody = z.infer<typeof redeemBody>;

export const createTicketBody = z
  .object({
    severity: z.enum(SEVERITIES),
    category: z.enum(['login', 'payment', 'data', 'ui', 'other']).default('other'),
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().min(5).max(5000),
  })
  .strict();
export type CreateTicketBody = z.infer<typeof createTicketBody>;

export const customerMessageBody = z.object({ body: z.string().trim().min(1).max(5000) }).strict();
export type CustomerMessageBody = z.infer<typeof customerMessageBody>;

export const rateBody = z
  .object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() })
  .strict();
export type RateBody = z.infer<typeof rateBody>;

export const createInviteBody = z
  .object({
    targetUserId: z.string().regex(/^U[0-9a-f]{32}$/).nullable().default(null),
    expiresInHours: z.number().int().min(1).max(168).default(24),
    requireApproval: z.boolean().default(true),
  })
  .strict();
export type CreateInviteBody = z.infer<typeof createInviteBody>;

export const inviteIdSchema = z.uuid();
