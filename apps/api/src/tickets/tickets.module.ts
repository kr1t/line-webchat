import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { InboxModule } from '../inbox/inbox.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { BotMessengerService } from './bot-messenger.service.js';
import { CustomerFlowService } from './customer-flow.service.js';
import { QuotaService } from './quota.service.js';
import { TicketsAdminService } from './tickets-admin.service.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

@Module({
  imports: [AuthModule, ConversationsModule, InboxModule, SettingsModule],
  controllers: [TicketsController],
  providers: [TicketsService, BotMessengerService, CustomerFlowService, QuotaService, TicketsAdminService],
  exports: [TicketsService, BotMessengerService, CustomerFlowService, QuotaService],
})
export class TicketsModule {}
