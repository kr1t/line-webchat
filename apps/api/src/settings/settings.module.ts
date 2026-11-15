import { Module } from '@nestjs/common';
import { BusinessHoursService } from './business-hours.service.js';
import { CannedService } from './canned.service.js';
import { SettingsController } from './settings.controller.js';

@Module({
  controllers: [SettingsController],
  providers: [BusinessHoursService, CannedService],
  exports: [BusinessHoursService],
})
export class SettingsModule {}
