import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { messagingApi } from '@line/bot-sdk';
import type { Env } from '../config/env.js';
import { LINE_BLOB_CLIENT, LINE_MESSAGING_CLIENT } from './line.constants.js';

/** The Messaging API clients, shared by the webhook, inbox, tickets and rich menu. */
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
    {
      // Uploads (rich menu images) go to api-data.line.me
      provide: LINE_BLOB_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new messagingApi.MessagingApiBlobClient({
          channelAccessToken: config.get('LINE_CHANNEL_ACCESS_TOKEN', { infer: true }),
        }),
    },
  ],
  exports: [LINE_MESSAGING_CLIENT, LINE_BLOB_CLIENT],
})
export class LineClientModule {}
