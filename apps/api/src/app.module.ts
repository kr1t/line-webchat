import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminsModule } from './admins/admins.module.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';
import { InboxModule } from './inbox/inbox.module.js';
import { LineModule } from './line/line.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }), DatabaseModule, AuthModule, AdminsModule, LineModule, InboxModule],
  controllers: [HealthController],
})
export class AppModule {}
