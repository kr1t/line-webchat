import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { messagingApi } from '@line/bot-sdk';
import type { Env } from '../config/env.js';
import { LINE_MESSAGING_CLIENT } from './line.constants.js';
import { LineSignatureGuard } from './line-signature.guard.js';
import { LineWebhookController } from './line-webhook.controller.js';
import { LineWebhookService } from './line-webhook.service.js';

@Module({
  controllers: [LineWebhookController],
  providers: [
    {
      provide: LINE_MESSAGING_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new messagingApi.MessagingApiClient({
          channelAccessToken: config.get('LINE_CHANNEL_ACCESS_TOKEN', { infer: true }),
        }),
    },
    LineSignatureGuard,
    LineWebhookService,
  ],
  exports: [LINE_MESSAGING_CLIENT],
})
export class LineModule {}
