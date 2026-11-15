import { Module } from '@nestjs/common';
import { InboxController } from './inbox.controller.js';
import { InboxService } from './inbox.service.js';
import { ReplyService } from './reply.service.js';
import { LineModule } from '../line/line.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { TeamController } from './team.controller.js';

@Module({
  imports: [LineModule, ConversationsModule],
  controllers: [InboxController, TeamController],
  providers: [InboxService, ReplyService],
})
export class InboxModule {}
