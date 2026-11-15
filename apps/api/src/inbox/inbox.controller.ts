import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req } from '@nestjs/common';
import { type AuthedRequest, CurrentAdmin, RequireStepUp } from '../auth/decorators.js';
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
  type RoleBody,
  roleBody,
  type TransferBody,
  transferBody,
} from './inbox.schemas.js';
import { CustomerRoleService } from './customer-role.service.js';
import { ConversationStatusService } from '../conversations/conversation-status.service.js';
import { InboxService } from './inbox.service.js';
import { ReplyService } from './reply.service.js';

const UserIdPipe = new ZodValidationPipe(lineUserIdSchema);

@Controller('conversations')
export class InboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly replies: ReplyService,
    private readonly status: ConversationStatusService,
    private readonly roles: CustomerRoleService,
  ) {}

  @Get()
  list(@CurrentAdmin() admin: Admin, @Query(new ZodValidationPipe(listConversationsQuery)) query: ListConversationsQuery) {
    return this.inbox.listConversations(query, admin.id);
  }

  // Declared before ':userId' so "counts" is not read as a user id
  @Get('counts')
  counts(@CurrentAdmin() admin: Admin) {
    return this.inbox.counts(admin.id);
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
    return this.replies.send(userId, body.text, admin);
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

  @Get(':userId/events')
  events(@Param('userId', UserIdPipe) userId: string) {
    return this.status.listEvents(userId);
  }

  @Post(':userId/claim')
  @HttpCode(HttpStatus.NO_CONTENT)
  claim(@CurrentAdmin() admin: Admin, @Param('userId', UserIdPipe) userId: string) {
    return this.status.claim(userId, admin);
  }

  @Post(':userId/transfer')
  @HttpCode(HttpStatus.NO_CONTENT)
  transfer(
    @CurrentAdmin() admin: Admin,
    @Param('userId', UserIdPipe) userId: string,
    @Body(new ZodValidationPipe(transferBody)) body: TransferBody,
  ) {
    return this.status.transfer(userId, admin, body.adminId);
  }

  // Gives access outside the CMS, so it needs a fresh 2FA code like admin management
  @RequireStepUp()
  @Put(':userId/role')
  setRole(
    @CurrentAdmin() admin: Admin,
    @Param('userId', UserIdPipe) userId: string,
    @Body(new ZodValidationPipe(roleBody)) body: RoleBody,
    @Req() req: AuthedRequest,
  ) {
    return this.roles.setRole(userId, body.role, { adminId: admin.id, ip: req.ip, via: 'chat' });
  }

  @Post(':userId/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  close(@CurrentAdmin() admin: Admin, @Param('userId', UserIdPipe) userId: string) {
    return this.status.close(userId, admin);
  }
}
