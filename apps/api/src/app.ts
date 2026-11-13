import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

const ONE_MB = 1024 * 1024;

export function createAdapter(): FastifyAdapter {
  return new FastifyAdapter({ bodyLimit: ONE_MB, trustProxy: true });
}

/** Middleware and settings shared by the real app and the e2e tests. */
export async function configureApp(app: NestFastifyApplication): Promise<NestFastifyApplication> {
  await app.register(helmet);
  await app.register(cookie);
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
