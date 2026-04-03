import { Worker, isMainThread, parentPort } from "worker_threads";
import { createLogger } from "@trpc-template/server";

const log = createLogger("Watchdog");

const PING_INTERVAL_MS = 15_000; // Ping main thread every 15s
const TIMEOUT_MS = 30_000; // If no pong in 30s, event loop is frozen

/**
 * Worker Thread watchdog that detects main thread event loop freezes.
 *
 * When the event loop freezes (e.g. GC thrashing, infinite loop), the main
 * thread can't respond to pings. The worker thread runs independently and
 * will log a warning + exit the process so Heroku restarts the dyno.
 */

if (!isMainThread) {
  // --- Worker thread code ---
  let lastPong = Date.now();

  parentPort!.on("message", (msg: string) => {
    if (msg === "pong") {
      lastPong = Date.now();
    }
  });

  setInterval(() => {
    const elapsed = Date.now() - lastPong;
    if (elapsed > TIMEOUT_MS) {
      const seconds = Math.round(elapsed / 1000);
      process.stderr.write(
        `[watchdog] FATAL: Main thread event loop frozen for ${seconds}s. Killing process.\n`
      );
      // process.exit() in a worker only kills the worker thread, not the main process.
      // process.abort() terminates the entire process from any thread.
      process.abort();
    }

    // Send ping to main thread
    parentPort!.postMessage("ping");
  }, PING_INTERVAL_MS);
}

/**
 * Start the watchdog from the main thread.
 * Call this once after server.listen() succeeds.
 */
export function startWatchdog(): void {
  if (!isMainThread) return;

  const workerExecArgv =
    process.env.NODE_ENV === "development"
      ? process.execArgv.filter(
          (arg) =>
            arg.startsWith("--require") ||
            arg.startsWith("-r") ||
            arg.startsWith("--loader") ||
            arg.startsWith("--import") ||
            arg.startsWith("--inspect")
        )
      : undefined;

  const worker = new Worker(__filename, workerExecArgv ? {
    execArgv: workerExecArgv,
  } : undefined);

  worker.on("message", (msg: string) => {
    if (msg === "ping") {
      worker.postMessage("pong");
    }
  });

  worker.on("error", (err: Error) => {
    log.error("Worker error:", err.message);
  });

  worker.on("exit", (code: number) => {
    if (code !== 0) {
      log.error(`Worker exited with code ${code}`);
    }
  });

  // Ensure worker doesn't prevent process from exiting normally
  worker.unref();

  log.info("Event loop monitor started");
}
