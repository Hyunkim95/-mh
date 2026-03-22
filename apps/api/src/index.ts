import {
  server,
  hopsSchedulerService,
  dualDirectionContractEventsService,
  obfuscationSchedulerService,
  createLogger,
} from "@trpc-template/server";
import { startWatchdog } from "./watchdog";

const log = createLogger("API");

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    const host = process.env.HOST || "0.0.0.0";
    await server.listen({ port, host });
    log.info(`Server ready at http://${host}:${port}`);
    log.info(`tRPC endpoint: http://${host}:${port}/trpc`);
    log.info(`Health check: http://${host}:${port}/health`);

    // Diagnostic heartbeat: log every 60s so we can tell when the process goes silent
    const dynoType = process.env.SCHEDULER_ENABLED === "true" ? "scheduler" :
                     process.env.DUAL_DIRECTION_ENABLED === "true" ? "indexer" : "web";
    if (dynoType === "web") {
      startWatchdog();
      setInterval(() => {
        const mem = process.memoryUsage();
        log.debug(`heartbeat web alive | rss=${Math.round(mem.rss / 1024 / 1024)}MB heap=${Math.round(mem.heapUsed / 1024 / 1024)}/${Math.round(mem.heapTotal / 1024 / 1024)}MB eventloop=ok`);
      }, 60_000);
    }
  } catch (err) {
    log.error("Startup error", err);
    server.log.error(err);
    process.exit(1);
  }
};

if (process.env.SCHEDULER_ENABLED === "true") {
  log.info("Starting hops scheduler service");
  hopsSchedulerService.triggerHopJob.start();
  obfuscationSchedulerService.startObfuscationScheduler();
}

if (process.env.DUAL_DIRECTION_ENABLED === "true") {
  log.info("Starting dual direction contract events service");
  dualDirectionContractEventsService.initialize();
}

start();
