import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AuditService } from '../auth/audit.service.js';
import { type AuthedRequest, CurrentAdmin } from '../auth/decorators.js';
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
import { toCsv } from './csv.js';
import { SEVERITIES, SLA, STATUS_LABELS } from './sla.js';

const TicketIdPipe = new ZodValidationPipe(ticketIdSchema);

@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly tickets: TicketsAdminService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentAdmin() admin: Admin, @Query(new ZodValidationPipe(listTicketsQuery)) query: ListTicketsQuery) {
    return this.tickets.list(query, admin);
  }

  @Get('counts')
  counts(@CurrentAdmin() admin: Admin) {
    return this.tickets.counts(admin);
  }

  /** Same filters as the list; downloads up to 5,000 rows. */
  @Get('export.csv')
  async exportCsv(
    @CurrentAdmin() admin: Admin,
    @Query(new ZodValidationPipe(listTicketsQuery)) query: ListTicketsQuery,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const rows = await this.tickets.list({ ...query, limit: 5000 }, admin);
    await this.audit.log('tickets.exported', { actorId: admin.id, targetId: `${rows.length} rows`, ip: req.ip });

    const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : '');
    const sla = (state: string) => ({ met: 'ทัน', breached: 'ไม่ทัน', ok: 'ยังไม่ครบกำหนด', at_risk: 'ใกล้ครบ', none: '-' })[state] ?? state;
    const csv = toCsv(
      ['เลข', 'หัวข้อ', 'หมวด', 'ระดับ', 'ระดับที่ลูกค้าแจ้ง', 'สถานะ', 'ลูกค้า', 'ผู้รับผิดชอบ', 'แจ้งเมื่อ', 'ตอบแรกเมื่อ', 'แก้เสร็จเมื่อ', 'ปิดเมื่อ', 'ตอบทัน SLA', 'แก้ทัน SLA', 'คะแนน'],
      rows.map((t) => [
        t.code,
        t.title,
        t.category,
        `${t.severity} ${SEVERITIES.includes(t.severity) ? SLA[t.severity].label : ''}`,
        t.reportedSeverity,
        STATUS_LABELS[t.status],
        t.reporter.displayName,
        t.assigneeName,
        iso(t.createdAt),
        iso(t.firstResponseAt),
        iso(t.resolvedAt),
        iso(t.closedAt),
        sla(t.sla.response),
        sla(t.sla.resolve),
        t.rating,
      ]),
    );
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="tickets-${stamp}.csv"`);
    reply.header('cache-control', 'no-store');
    return csv;
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
