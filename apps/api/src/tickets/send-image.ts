import type { FastifyReply } from 'fastify';

/** Serves a stored picture: only image types we sniffed, never cached by shared caches. */
export function sendImage(reply: FastifyReply, file: { contentType: string; data: Buffer }) {
  reply.header('content-type', file.contentType);
  reply.header('content-disposition', 'inline');
  reply.header('cache-control', 'private, max-age=3600');
  reply.header('x-content-type-options', 'nosniff');
  return reply.send(file.data);
}
