import { User, Session } from '@trpc-template/server';

declare module 'fastify' {
  interface FastifyRequest {
    user: User;
    session: Session;
  }
}