import {
  server,
  hopsSchedulerService,
  dualDirectionContractEventsService,
} from "@trpc-template/server";
import { env } from "./env";

const start = async () => {
  console.log("env", process.env);
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

if (true) {
  console.log("Starting hops scheduler service");
  hopsSchedulerService.triggerHopJob.start();
}

if (true) {
  console.log("Starting dual direction contract events service");
  dualDirectionContractEventsService.initialize();
}

start();
