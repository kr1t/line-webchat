import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:mm');

export const businessHoursSchema = z
  .object({
    enabled: z.boolean(),
    // 0 = Sunday … 6 = Saturday (Asia/Bangkok); null means closed all day
    days: z
      .array(z.object({ open: time, close: time }).refine((d) => d.open < d.close, 'open must be before close').nullable())
      .length(7),
    message: z.string().trim().min(1).max(500),
  })
  .strict();
export type BusinessHours = z.infer<typeof businessHoursSchema>;

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  enabled: false,
  days: [null, ...Array.from({ length: 5 }, () => ({ open: '09:00', close: '18:00' })), null],
  message: 'ขอบคุณที่ติดต่อมาครับ ตอนนี้อยู่นอกเวลาทำการ ทีมจะตอบกลับ{next}',
};

export const cannedBody = z
  .object({
    shortcut: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9ก-๙_-]{1,30}$/, 'letters, numbers, - and _ only'),
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().min(1).max(2000),
  })
  .strict();
export type CannedBody = z.infer<typeof cannedBody>;

export const cannedIdSchema = z.uuid();
