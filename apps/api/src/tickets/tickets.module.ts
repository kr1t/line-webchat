import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { BotMessengerService } from './bot-messenger.service.js';
import { CustomerFlowService } from './customer-flow.service.js';
import { TicketsService } from './tickets.service.js';

@Module({
  imports: [ConversationsModule],
  providers: [TicketsService, BotMessengerService, CustomerFlowService],
  exports: [TicketsService, BotMessengerService, CustomerFlowService],
})
export class TicketsModule {}
