import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

const ONE_MB = 1024 * 1024;
// Screenshots from the LIFF page arrive as raw image bodies (resized in the browser first)
const IMAGE_BODY_LIMIT = 5 * ONE_MB;

export function createAdapter(): FastifyAdapter {
  return new FastifyAdapter({ bodyLimit: ONE_MB, trustProxy: true });
}

/** Middleware and settings shared by the real app and the e2e tests. */
export async function configureApp(app: NestFastifyApplication): Promise<NestFastifyApplication> {
  await app.register(helmet);
  await app.register(cookie);
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(/^image\/(jpeg|png|webp|gif)$/, { parseAs: 'buffer', bodyLimit: IMAGE_BODY_LIMIT }, (_req, body, done) =>
      done(null, body),
    );
  app.enableShutdownHooks();
  return app;
}

// Shared by the local server (main.ts) and the Vercel function (api/index.js)
export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createAdapter(), {
    rawBody: true,
  });
  return configureApp(app);
}
