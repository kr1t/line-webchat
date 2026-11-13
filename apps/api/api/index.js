// Vercel entrypoint: every request is rewritten here (see vercel.json)
// and handed to the Fastify instance behind Nest.
import { createApp } from '../dist/app.js';

let instancePromise;

async function getInstance() {
  if (!instancePromise) {
    instancePromise = (async () => {
      const app = await createApp();
      await app.init();
      const fastify = app.getHttpAdapter().getInstance();
      await fastify.ready();
      return fastify;
    })().catch((error) => {
      instancePromise = undefined;
      throw error;
    });
  }
  return instancePromise;
}

export default async function handler(req, res) {
  const fastify = await getInstance();
  fastify.server.emit('request', req, res);
}
