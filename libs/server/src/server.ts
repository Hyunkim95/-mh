import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { router, createContext, server } from "./trpc";
import { helloRouter } from "./routers/hello";
import { contractRouter } from "./routers/contract.router";
import { routesRouter } from "./routers/routes.router";
import { authRouter } from "./routers/auth.router";
import { tokenConfigsRouter } from "./routers/token-configs.router";
import { tokensRouter } from "./routers/tokens.router";

export const appRouter = router({
  hello: helloRouter,
  contract: contractRouter,
  routes: routesRouter,
  auth: authRouter,
  tokenConfigs: tokenConfigsRouter,
  tokens: tokensRouter,
});

server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter,
    createContext,
  },
});

server.get("/health", async (_, reply) => {
  reply.send({
    success: true,
    data: {
      status: "healthy",
    },
  });
});

export type AppRouter = typeof appRouter;
export { server };
