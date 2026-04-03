import {
  server,
  hopsSchedulerService,
  dualDirectionContractEventsService,
  obfuscationSchedulerService,
  createLogger,
} from "@trpc-template/server";
import { startWatchdog } from "./watchdog";
import { monitorEventLoopDelay } from "node:perf_hooks";

const log = createLogger("API");
const shouldExplicitlyRunApiServer = process.env.RUN_API_SERVER === "true";
const isSchedulerProcess = process.env.SCHEDULER_ENABLED === "true";
const isIndexerProcess = process.env.DUAL_DIRECTION_ENABLED === "true";
const shouldRunApiServer =
  shouldExplicitlyRunApiServer || (!isSchedulerProcess && !isIndexerProcess);

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    const host = process.env.HOST || "0.0.0.0";
    await server.listen({ port, host });
    log.info(`Server ready at http://${host}:${port}`);
    log.info(`tRPC endpoint: http://${host}:${port}/trpc`);
    log.info(`Health check: http://${host}:${port}/health`);

    // Diagnostic heartbeat: log every 60s so we can tell when the process goes silent
    const dynoType = isSchedulerProcess ? "scheduler" :
                     isIndexerProcess ? "indexer" : "web";
    if (dynoType === "web" && process.env.NODE_ENV === "production") {
      startWatchdog();

      // Event loop delay histogram (20ms resolution, resets each heartbeat)
      const eld = monitorEventLoopDelay({ resolution: 20 });
      eld.enable();

      let prevCpu = process.cpuUsage();

      setInterval(() => {
        const mem = process.memoryUsage();
        const rss = Math.round(mem.rss / 1024 / 1024);
        const heapUsed = Math.round(mem.heapUsed / 1024 / 1024);
        const heapTotal = Math.round(mem.heapTotal / 1024 / 1024);

        // CPU usage delta since last heartbeat (microseconds -> milliseconds)
        const cpuDelta = process.cpuUsage(prevCpu);
        prevCpu = process.cpuUsage();
        const cpuUser = Math.round(cpuDelta.user / 1000);
        const cpuSys = Math.round(cpuDelta.system / 1000);

        // Event loop delay (nanoseconds -> milliseconds)
        const loopP50 = (eld.percentile(50) / 1e6).toFixed(1);
        const loopP99 = (eld.percentile(99) / 1e6).toFixed(1);
        const loopMax = (eld.max / 1e6).toFixed(1);
        eld.reset();

        // Active handles breakdown
        const handles = (process as any)._getActiveHandles() as any[];
        const handleCounts: Record<string, number> = {};
        for (const h of handles) {
          const name = h.constructor?.name || "Unknown";
          handleCounts[name] = (handleCounts[name] || 0) + 1;
        }
        const handleStr = Object.entries(handleCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k}:${v}`)
          .join(",");

        const requests = (process as any)._getActiveRequests().length;

        log.debug(
          `heartbeat web alive | rss=${rss}MB heap=${heapUsed}/${heapTotal}MB` +
          ` | cpu_user=${cpuUser}ms cpu_sys=${cpuSys}ms` +
          ` | loop_p50=${loopP50}ms loop_p99=${loopP99}ms loop_max=${loopMax}ms` +
          ` | handles=${handles.length} (${handleStr})` +
          ` | requests=${requests}`
        );
      }, 60_000);
    }
  } catch (err) {
    log.error("Startup error", err);
    server.log.error(err);
    process.exit(1);
  }
};

if (isSchedulerProcess) {
  log.info("Starting hops scheduler service");
  hopsSchedulerService.triggerHopJob.start();
  obfuscationSchedulerService.startObfuscationScheduler();
}

if (isIndexerProcess) {
  log.info("Starting dual direction contract events service");
  dualDirectionContractEventsService.initialize();
}

if (shouldRunApiServer) {
  start();
} else {
  log.info("Worker process detected, skipping HTTP server startup");
}
