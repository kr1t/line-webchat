import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put } from '@nestjs/common';
import { CurrentAdmin, Roles } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Admin } from '../db/schema.js';
import { BusinessHoursService } from './business-hours.service.js';
import { CannedService } from './canned.service.js';
import { type BusinessHours, businessHoursSchema, type CannedBody, cannedBody, cannedIdSchema } from './settings.schemas.js';

const IdPipe = new ZodValidationPipe(cannedIdSchema);

@Controller()
export class SettingsController {
  constructor(
    private readonly hours: BusinessHoursService,
    private readonly canned: CannedService,
  ) {}

  @Get('settings/business-hours')
  getHours() {
    return this.hours.get();
  }

  @Roles('SUPER_ADMIN')
  @Put('settings/business-hours')
  setHours(@CurrentAdmin() admin: Admin, @Body(new ZodValidationPipe(businessHoursSchema)) body: BusinessHours) {
    return this.hours.set(body, admin.id);
  }

  @Get('canned-responses')
  listCanned() {
    return this.canned.list();
  }

  @Post('canned-responses')
  createCanned(@CurrentAdmin() admin: Admin, @Body(new ZodValidationPipe(cannedBody)) body: CannedBody) {
    return this.canned.create(body, admin.id);
  }

  @Patch('canned-responses/:id')
  updateCanned(@Param('id', IdPipe) id: string, @Body(new ZodValidationPipe(cannedBody)) body: CannedBody) {
    return this.canned.update(id, body);
  }

  @Delete('canned-responses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCanned(@Param('id', IdPipe) id: string) {
    return this.canned.remove(id);
  }

  @Post('canned-responses/:id/use')
  @HttpCode(HttpStatus.NO_CONTENT)
  useCanned(@Param('id', IdPipe) id: string) {
    return this.canned.markUsed(id);
  }
}
