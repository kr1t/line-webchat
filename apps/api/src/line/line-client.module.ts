import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { messagingApi } from '@line/bot-sdk';
import type { Env } from '../config/env.js';
import { LINE_MESSAGING_CLIENT } from './line.constants.js';

/** The Messaging API client, shared by the webhook, inbox and tickets. */
@Global()
@Module({
  providers: [
    {
      provide: LINE_MESSAGING_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new messagingApi.MessagingApiClient({
          channelAccessToken: config.get('LINE_CHANNEL_ACCESS_TOKEN', { infer: true }),
        }),
    },
  ],
  exports: [LINE_MESSAGING_CLIENT],
})
export class LineClientModule {}
