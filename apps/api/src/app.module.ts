import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminsModule } from './admins/admins.module.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';
import { InboxModule } from './inbox/inbox.module.js';
import { LineClientModule } from './line/line-client.module.js';
import { LineModule } from './line/line.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { TicketsModule } from './tickets/tickets.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }), DatabaseModule, LineClientModule, AuthModule, AdminsModule, LineModule, InboxModule, TicketsModule, SettingsModule, ReportsModule],
  controllers: [HealthController],
})
export class AppModule {}
