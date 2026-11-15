import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentAdmin } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Admin } from '../db/schema.js';
import { NotificationsService } from './notifications.service.js';

const query = z
  .object({
    // Not older than a day: a long-closed tab should not replay everything
    since: z.iso
      .datetime()
      .optional()
      .transform((v) => (v && Date.parse(v) < Date.now() - 86_400_000 ? new Date(Date.now() - 86_400_000).toISOString() : v)),
  })
  .strict();

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentAdmin() admin: Admin, @Query(new ZodValidationPipe(query)) q: z.infer<typeof query>) {
    return this.notifications.since(admin, q.since);
  }
}
