import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { type AuthedRequest, CurrentAdmin, RequireStepUp, Roles } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Admin } from '../db/schema.js';
import {
  adminIdSchema,
  type AuditQuery,
  auditQuery,
  type CreateAdminBody,
  createAdminBody,
  type UpdateAdminBody,
  updateAdminBody,
} from './admins.schemas.js';
import { AdminsService } from './admins.service.js';

const AdminIdPipe = new ZodValidationPipe(adminIdSchema);

@Roles('SUPER_ADMIN')
@Controller()
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get('admins')
  list() {
    return this.admins.list();
  }

  @RequireStepUp()
  @Post('admins')
  create(
    @CurrentAdmin() actor: Admin,
    @Body(new ZodValidationPipe(createAdminBody)) body: CreateAdminBody,
    @Req() req: AuthedRequest,
  ) {
    return this.admins.create(actor, body, req.ip);
  }

  @RequireStepUp()
  @Patch('admins/:id')
  update(
    @CurrentAdmin() actor: Admin,
    @Param('id', AdminIdPipe) id: string,
    @Body(new ZodValidationPipe(updateAdminBody)) body: UpdateAdminBody,
    @Req() req: AuthedRequest,
  ) {
    return this.admins.setActive(actor, id, body.isActive, req.ip);
  }

  @RequireStepUp()
  @Post('admins/:id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@CurrentAdmin() actor: Admin, @Param('id', AdminIdPipe) id: string, @Req() req: AuthedRequest) {
    return this.admins.resetPassword(actor, id, req.ip);
  }

  @RequireStepUp()
  @Post('admins/:id/reset-2fa')
  @HttpCode(HttpStatus.OK)
  resetTotp(@CurrentAdmin() actor: Admin, @Param('id', AdminIdPipe) id: string, @Req() req: AuthedRequest) {
    return this.admins.resetTotp(actor, id, req.ip);
  }

  @Get('audit-logs')
  auditLog(@Query(new ZodValidationPipe(auditQuery)) query: AuditQuery) {
    return this.admins.auditLog(query.limit);
  }
}
