import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { type AuthedRequest, CurrentAdmin, RequireStepUp } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Admin } from '../db/schema.js';
import { InvitesService } from './invites.service.js';
import { type CreateInviteBody, createInviteBody, inviteIdSchema } from './liff.schemas.js';

const IdPipe = new ZodValidationPipe(inviteIdSchema);

@Controller('role-invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get()
  list() {
    return this.invites.list();
  }

  // Creating and approving give access outside the CMS: fresh 2FA code required
  @RequireStepUp()
  @Post()
  create(@CurrentAdmin() admin: Admin, @Body(new ZodValidationPipe(createInviteBody)) body: CreateInviteBody, @Req() req: AuthedRequest) {
    return this.invites.create(body, admin, req.ip);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@CurrentAdmin() admin: Admin, @Param('id', IdPipe) id: string, @Req() req: AuthedRequest) {
    return this.invites.revoke(id, admin, req.ip);
  }

  @RequireStepUp()
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@CurrentAdmin() admin: Admin, @Param('id', IdPipe) id: string, @Req() req: AuthedRequest) {
    return this.invites.approve(id, admin, req.ip);
  }
}
