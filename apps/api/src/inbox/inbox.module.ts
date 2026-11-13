import { Module } from '@nestjs/common';
import { InboxController } from './inbox.controller.js';
import { InboxService } from './inbox.service.js';
import { ReplyService } from './reply.service.js';
import { LineModule } from '../line/line.module.js';

@Module({
  imports: [LineModule],
  controllers: [InboxController],
  providers: [InboxService, ReplyService],
})
export class InboxModule {}
