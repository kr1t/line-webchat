import { z } from 'zod';
import { SEVERITIES } from './sla.js';

const STATUSES = ['open', 'acknowledged', 'in_progress', 'waiting_customer', 'resolved', 'closed'] as const;
const CATEGORIES = ['login', 'payment', 'data', 'ui', 'other'] as const;

export const ticketIdSchema = z.uuid();

export const listTicketsQuery = z
  .object({
    status: z.enum(['active', 'all', ...STATUSES]).default('active'),
    severity: z.enum(SEVERITIES).optional(),
    assignee: z.union([z.enum(['me', 'unassigned']), z.uuid()]).optional(),
    sla: z.enum(['breached', 'at_risk']).optional(),
    reporterId: z.string().regex(/^U[0-9a-f]{32}$/).optional(),
    category: z.enum(CATEGORIES).optional(),
    q: z.string().trim().max(100).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();
export type ListTicketsQuery = z.infer<typeof listTicketsQuery>;

export const updateTicketBody = z
  .object({
    status: z.enum(STATUSES).optional(),
    severity: z.enum(SEVERITIES).optional(),
    // Changing the level moves the deadlines, so the reason is kept with the change
    severityReason: z.string().trim().min(3).max(300).optional(),
    assigneeId: z.uuid().nullable().optional(),
    category: z.enum(CATEGORIES).optional(),
  })
  .strict()
  .refine((body) => !body.severity || body.severityReason, {
    message: 'severityReason is required when changing severity',
    path: ['severityReason'],
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), { message: 'nothing to update' });
export type UpdateTicketBody = z.infer<typeof updateTicketBody>;

export const ticketMessageBody = z
  .object({
    body: z.string().trim().min(1).max(4900),
    internal: z.boolean().default(false),
  })
  .strict();
export type TicketMessageBody = z.infer<typeof ticketMessageBody>;

export const attachMessageBody = z.object({ messageId: z.uuid() }).strict();
export type AttachMessageBody = z.infer<typeof attachMessageBody>;
