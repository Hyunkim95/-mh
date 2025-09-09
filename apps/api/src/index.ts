import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { appRouter, createContext } from '@trpc-template/server';
import './types'; // Import Fastify type extensions

const server = Fastify({
  maxParamLength: 5000,
});

// Register CORS
server.register(cors, {
  origin: true,
  credentials: true,
});

// Register tRPC
server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext,
  },
});

// Health check endpoint (keeping this as a simple REST endpoint for monitoring)
server.get('/health', async (_, reply) => {
  reply.send({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'multihopper-api',
      trpcEndpoint: '/trpc',
    },
  });
});

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    const host = process.env.HOST || '0.0.0.0';
    await server.listen({ port, host });
    console.log(`🚀 Server ready at http://${host}:${port}`);
    console.log(`📡 tRPC endpoint: http://${host}:${port}/trpc`);
    console.log(`🏥 Health check: http://${host}:${port}/health`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();