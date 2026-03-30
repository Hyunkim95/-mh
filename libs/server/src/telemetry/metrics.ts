import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("multihopper");

// Hop execution metrics
export const hopExecutionCounter = meter.createCounter(
  "hop.executions.total",
  { description: "Total number of hop execution attempts" },
);

export const hopExecutionDuration = meter.createHistogram(
  "hop.execution.duration_ms",
  { description: "Duration of hop execution in milliseconds", unit: "ms" },
);

export const hopFailureCounter = meter.createCounter("hop.failures.total", {
  description: "Total number of hop execution failures",
});

// Obfuscation metrics
export const obfuscationSessionCounter = meter.createCounter(
  "obfuscation.sessions.total",
  { description: "Total obfuscation sessions processed" },
);

export const obfuscationDuration = meter.createHistogram(
  "obfuscation.duration_ms",
  {
    description: "Duration of obfuscation processing in milliseconds",
    unit: "ms",
  },
);

// Route lifecycle metrics
export const routeCreatedCounter = meter.createCounter(
  "route.created.total",
  { description: "Total routes created" },
);

export const routeCompletedCounter = meter.createCounter(
  "route.completed.total",
  { description: "Total routes completed" },
);
