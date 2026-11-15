import { z } from 'zod';

export const dashboardQuery = z
  .object({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from < q.to, { message: 'from must be before to' })
  .refine((q) => !q.from || !q.to || Date.parse(q.to) - Date.parse(q.from) <= 366 * 86_400_000, {
    message: 'range is limited to one year',
  });
export type DashboardQuery = z.infer<typeof dashboardQuery>;

export const searchQuery = z.object({ q: z.string().trim().min(1).max(100) }).strict();
export type SearchQuery = z.infer<typeof searchQuery>;
