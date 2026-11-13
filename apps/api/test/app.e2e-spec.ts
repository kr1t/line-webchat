import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLineClientMock, createTestApp } from './utils.js';

describe('App (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp(createLineClientMock()));
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('sets security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns 404 for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
  });
});
