import {
  server,
  hopsSchedulerService,
  dualDirectionContractEventsService,
  obfuscationSchedulerService,
} from "@trpc-template/server";
import { startWatchdog } from "./watchdog";
import { monitorEventLoopDelay } from "node:perf_hooks";

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    const host = process.env.HOST || "0.0.0.0";
    await server.listen({ port, host });
    console.log(`🚀 Server ready at http://${host}:${port}`);
    console.log(`📡 tRPC endpoint: http://${host}:${port}/trpc`);
    console.log(`🏥 Health check: http://${host}:${port}/health`);

    // Diagnostic heartbeat: log every 60s so we can tell when the process goes silent
    const dynoType = process.env.SCHEDULER_ENABLED === "true" ? "scheduler" :
                     process.env.DUAL_DIRECTION_ENABLED === "true" ? "indexer" : "web";
    if (dynoType === "web") {
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

        console.log(
          `[heartbeat] web alive | rss=${rss}MB heap=${heapUsed}/${heapTotal}MB` +
          ` | cpu_user=${cpuUser}ms cpu_sys=${cpuSys}ms` +
          ` | loop_p50=${loopP50}ms loop_p99=${loopP99}ms loop_max=${loopMax}ms` +
          ` | handles=${handles.length} (${handleStr})` +
          ` | requests=${requests}`
        );
      }, 60_000);
    }
  } catch (err) {
    console.log("err", err);
    server.log.error(err);
    process.exit(1);
  }
};

if (process.env.SCHEDULER_ENABLED === "true") {
  console.log("Starting hops scheduler service");
  hopsSchedulerService.triggerHopJob.start();
  obfuscationSchedulerService.startObfuscationScheduler();
}

if (process.env.DUAL_DIRECTION_ENABLED === "true") {
  console.log("Starting dual direction contract events service");
  dualDirectionContractEventsService.initialize();
}

start();
