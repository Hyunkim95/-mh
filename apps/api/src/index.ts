import {
  server,
  hopsSchedulerService,
  dualDirectionContractEventsService,
} from "@trpc-template/server";
import { env } from "./env";

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    const host = process.env.HOST || "0.0.0.0";
    await server.listen({ port, host });
    console.log(`🚀 Server ready at http://${host}:${port}`);
    console.log(`📡 tRPC endpoint: http://${host}:${port}/trpc`);
    console.log(`🏥 Health check: http://${host}:${port}/health`);
  } catch (err) {
    console.log("err", err);
    server.log.error(err);
    process.exit(1);
  }
};

if (env.SCHEDULER_ENABLED === "true") {
  console.log("Starting hops scheduler service");
  hopsSchedulerService.triggerHopJob.start();
}

if (env.DUAL_DIRECTION_ENABLED === "true") {
  console.log("Starting dual direction contract events service");
  dualDirectionContractEventsService.initialize();
}

start();
