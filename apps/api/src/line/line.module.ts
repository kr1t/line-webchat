import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { LineSignatureGuard } from './line-signature.guard.js';
import { LineWebhookController } from './line-webhook.controller.js';
import { LineWebhookService } from './line-webhook.service.js';

@Module({
  imports: [ConversationsModule, TicketsModule],
  controllers: [LineWebhookController],
  providers: [LineSignatureGuard, LineWebhookService],
})
export class LineModule {}
