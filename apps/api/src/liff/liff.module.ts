import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import type { Env } from '../config/env.js';
import { InboxModule } from '../inbox/inbox.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { InvitesController } from './invites.controller.js';
import { InvitesService } from './invites.service.js';
import { createLineIdTokenVerifier } from './line-id-token.js';
import { LINE_ID_TOKEN_VERIFIER } from './liff.constants.js';
import { LiffController } from './liff.controller.js';
import { LiffGuard } from './liff.guard.js';
import { LiffSessionService } from './liff-session.service.js';
import { LiffTicketsService } from './liff-tickets.service.js';

@Module({
  imports: [AuthModule, InboxModule, TicketsModule],
  controllers: [LiffController, InvitesController],
  providers: [
    {
      provide: LINE_ID_TOKEN_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => createLineIdTokenVerifier(config.get('LINE_LOGIN_CHANNEL_ID', { infer: true })),
    },
    InvitesService,
    LiffGuard,
    LiffSessionService,
    LiffTicketsService,
  ],
})
export class LiffModule {}
