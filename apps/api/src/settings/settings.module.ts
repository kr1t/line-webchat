import { Module } from '@nestjs/common';
import { RichMenuModule } from '../rich-menu/rich-menu.module.js';
import { BusinessHoursService } from './business-hours.service.js';
import { CannedService } from './canned.service.js';
import { SettingsController } from './settings.controller.js';

@Module({
  imports: [RichMenuModule],
  controllers: [SettingsController],
  providers: [BusinessHoursService, CannedService],
  exports: [BusinessHoursService],
})
export class SettingsModule {}
