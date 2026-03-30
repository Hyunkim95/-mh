import pino from "pino";
import { trace } from "@opentelemetry/api";

const transport =
  process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined;

const rootLogger = pino({
  level:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
  transport,
});

export interface Logger {
  debug: (msg: string, ...args: unknown[]) => void;
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
}

/**
 * Create a context-scoped logger.
 * Wraps Pino to match the old `(msg, ...args)` call-site API so that
 * existing code does not need to change its logging calls.
 */
export function createLogger(context: string): Logger {
  const child = rootLogger.child({ context });

  const wrap =
    (level: "debug" | "info" | "warn" | "error") =>
    (msg: string, ...args: unknown[]) => {
      if (args.length === 0) {
        child[level](msg);
      } else if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
        child[level](args[0] as object, msg);
      } else {
        child[level]({ extra: args }, msg);
      }
    };

  return {
    debug: wrap("debug"),
    info: wrap("info"),
    warn: wrap("warn"),
    error: wrap("error"),
  };
}

/**
 * Get the current OTel trace context for manual correlation.
 * Returns undefined if no active span exists.
 */
export function getTraceContext():
  | { traceId: string; spanId: string }
  | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const ctx = span.spanContext();
  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

export { rootLogger };
