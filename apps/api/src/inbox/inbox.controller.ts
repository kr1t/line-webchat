import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CurrentAdmin } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Admin } from '../db/schema.js';
import {
  type ListConversationsQuery,
  listConversationsQuery,
  type ListMessagesQuery,
  listMessagesQuery,
  lineUserIdSchema,
  messageIdSchema,
  type SendMessageBody,
  sendMessageBody,
} from './inbox.schemas.js';
import { InboxService } from './inbox.service.js';
import { ReplyService } from './reply.service.js';

const UserIdPipe = new ZodValidationPipe(lineUserIdSchema);

@Controller('conversations')
export class InboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly replies: ReplyService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(listConversationsQuery)) query: ListConversationsQuery) {
    return this.inbox.listConversations(query);
  }

  @Get(':userId')
  get(@Param('userId', UserIdPipe) userId: string) {
    return this.inbox.getConversation(userId);
  }

  @Get(':userId/messages')
  messages(
    @Param('userId', UserIdPipe) userId: string,
    @Query(new ZodValidationPipe(listMessagesQuery)) query: ListMessagesQuery,
  ) {
    return this.inbox.listMessages(userId, query);
  }

  @Post(':userId/messages')
  send(
    @CurrentAdmin() admin: Admin,
    @Param('userId', UserIdPipe) userId: string,
    @Body(new ZodValidationPipe(sendMessageBody)) body: SendMessageBody,
  ) {
    return this.replies.send(userId, body.text, admin.id);
  }

  @Post(':userId/messages/:messageId/retry')
  @HttpCode(HttpStatus.OK)
  retry(
    @Param('userId', UserIdPipe) userId: string,
    @Param('messageId', new ZodValidationPipe(messageIdSchema)) messageId: string,
  ) {
    return this.replies.retry(userId, messageId);
  }

  @Post(':userId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markAsRead(@Param('userId', UserIdPipe) userId: string) {
    return this.inbox.markAsRead(userId);
  }
}
