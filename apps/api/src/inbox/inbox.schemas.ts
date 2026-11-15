import { z } from 'zod';

export const lineUserIdSchema = z.string().regex(/^U[0-9a-f]{32}$/, 'invalid LINE user id');

export const listConversationsQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    filter: z.enum(['all', 'unread', 'open', 'mine', 'handling', 'closed', 'pinned']).default('all'),
  })
  .strict();
export type ListConversationsQuery = z.infer<typeof listConversationsQuery>;

export const listMessagesQuery = z
  .object({
    before: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type ListMessagesQuery = z.infer<typeof listMessagesQuery>;

// LINE allows up to 5000 characters per text message
export const sendMessageBody = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'message is empty')
      .max(5000, 'message is longer than 5000 characters'),
  })
  .strict();
export type SendMessageBody = z.infer<typeof sendMessageBody>;

export const messageIdSchema = z.uuid();

export const roleBody = z.object({ role: z.enum(['CUSTOMER']).nullable() }).strict();
export type RoleBody = z.infer<typeof roleBody>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

// Team-wide name and note for a customer; null clears them
export const profileBody = z
  .object({ alias: optionalText(60).optional(), remark: optionalText(500).optional() })
  .strict()
  .refine((b) => b.alias !== undefined || b.remark !== undefined, { message: 'nothing to update' });
export type ProfileBody = z.infer<typeof profileBody>;

export const pinBody = z.object({ team: z.boolean().default(false) }).strict();
export type PinBody = z.infer<typeof pinBody>;

// Query strings carry text, so "true"/"false" here
export const unpinQuery = z
  .object({ team: z.enum(['true', 'false']).default('false').transform((v) => v === 'true') })
  .strict();
export type UnpinQuery = z.infer<typeof unpinQuery>;

export const transferBody = z.object({ adminId: z.uuid() }).strict();
export type TransferBody = z.infer<typeof transferBody>;
