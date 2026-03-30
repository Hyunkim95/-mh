import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { router, createContext, server } from "./trpc";
import { helloRouter } from "./routers/hello";
import { contractRouter } from "./routers/contract.router";
import { routesRouter } from "./routers/routes.router";
import { authRouter } from "./routers/auth.router";
import { tokenConfigsRouter } from "./routers/token-configs.router";
import { tokensRouter } from "./routers/tokens.router";
import { easyRoutesRouter } from "./routers/easy-routes.router";
import { client } from "./db/connection";
import { getCachedConnection } from "./solana/services/contract-utils";
import { createLogger } from "@libs/logger";

export const appRouter = router({
  hello: helloRouter,
  contract: contractRouter,
  routes: routesRouter,
  easyRoutes: easyRoutesRouter,
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

const healthLog = createLogger("Health");

server.get("/health", async (_, reply) => {
  const checks: Record<
    string,
    { status: string; latencyMs?: number; error?: string }
  > = {};

  // Database check
  try {
    const dbStart = performance.now();
    await client.query("SELECT 1");
    checks.database = { status: "ok", latencyMs: Math.round(performance.now() - dbStart) };
  } catch (err) {
    checks.database = {
      status: "error",
      error: err instanceof Error ? err.message : "unknown",
    };
  }

  // Solana RPC check
  try {
    const solStart = performance.now();
    await getCachedConnection().getBlockHeight();
    checks.solana = { status: "ok", latencyMs: Math.round(performance.now() - solStart) };
  } catch (err) {
    checks.solana = {
      status: "error",
      error: err instanceof Error ? err.message : "unknown",
    };
  }

  const allOk = Object.values(checks).every((c) => c.status === "ok");
  const status = allOk ? "healthy" : "degraded";

  if (!allOk) {
    healthLog.warn("Health check degraded", checks);
  }

  reply.status(allOk ? 200 : 503).send({
    status,
    uptime: Math.round(process.uptime()),
    checks,
  });
});

export type AppRouter = typeof appRouter;
export { server };
