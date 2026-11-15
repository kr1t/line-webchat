import { Module } from '@nestjs/common';
import { ConversationStatusService } from './conversation-status.service.js';

@Module({
  providers: [ConversationStatusService],
  exports: [ConversationStatusService],
})
export class ConversationsModule {}
