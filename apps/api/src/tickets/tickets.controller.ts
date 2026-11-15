import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentAdmin } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Admin } from '../db/schema.js';
import {
  type AttachMessageBody,
  attachMessageBody,
  type ListTicketsQuery,
  listTicketsQuery,
  type TicketMessageBody,
  ticketIdSchema,
  ticketMessageBody,
  type UpdateTicketBody,
  updateTicketBody,
} from './tickets.schemas.js';
import { TicketsAdminService } from './tickets-admin.service.js';

const TicketIdPipe = new ZodValidationPipe(ticketIdSchema);

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsAdminService) {}

  @Get()
  list(@CurrentAdmin() admin: Admin, @Query(new ZodValidationPipe(listTicketsQuery)) query: ListTicketsQuery) {
    return this.tickets.list(query, admin);
  }

  @Get('counts')
  counts(@CurrentAdmin() admin: Admin) {
    return this.tickets.counts(admin);
  }

  @Get(':id')
  detail(@Param('id', TicketIdPipe) id: string) {
    return this.tickets.detail(id);
  }

  @Patch(':id')
  update(
    @CurrentAdmin() admin: Admin,
    @Param('id', TicketIdPipe) id: string,
    @Body(new ZodValidationPipe(updateTicketBody)) body: UpdateTicketBody,
  ) {
    return this.tickets.update(id, body, admin);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentAdmin() admin: Admin,
    @Param('id', TicketIdPipe) id: string,
    @Body(new ZodValidationPipe(ticketMessageBody)) body: TicketMessageBody,
  ) {
    return this.tickets.addMessage(id, body, admin);
  }

  @Post(':id/attach')
  @HttpCode(HttpStatus.OK)
  attach(@Param('id', TicketIdPipe) id: string, @Body(new ZodValidationPipe(attachMessageBody)) body: AttachMessageBody) {
    return this.tickets.attachChatMessage(id, body.messageId);
  }
}
