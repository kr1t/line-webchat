import { Module } from '@nestjs/common';
import { InboxController } from './inbox.controller.js';
import { InboxService } from './inbox.service.js';
import { CustomerRoleService } from './customer-role.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { ReplyService } from './reply.service.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { TeamController } from './team.controller.js';
import { RichMenuModule } from '../rich-menu/rich-menu.module.js';

@Module({
  imports: [AuthModule, ConversationsModule, RichMenuModule],
  controllers: [InboxController, TeamController],
  providers: [InboxService, ReplyService, CustomerRoleService],
  exports: [ReplyService, CustomerRoleService],
})
export class InboxModule {}
