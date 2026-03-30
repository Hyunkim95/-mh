import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import {
  ConsoleMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

const isProd = process.env.NODE_ENV === "production";
const serviceName = process.env.OTEL_SERVICE_NAME || "multihopper-api";
const serviceVersion = process.env.npm_package_version || "0.0.0";

// Enable OTel diagnostic logging when OTEL_DEBUG is set
if (process.env.OTEL_DEBUG === "true") {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
}

const resource = new Resource({
  [ATTR_SERVICE_NAME]: serviceName,
  [ATTR_SERVICE_VERSION]: serviceVersion,
  "deployment.environment.name": process.env.NODE_ENV || "development",
  "service.instance.id": process.env.DYNO || `local-${process.pid}`,
});

// --- Trace Exporter ---
const traceExporter = isProd
  ? new OTLPTraceExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
        `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318"}/v1/traces`,
    })
  : new ConsoleSpanExporter();

// --- Metric Reader ---
const metricReader = new PeriodicExportingMetricReader({
  exporter: isProd
    ? new OTLPMetricExporter({
        url:
          process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ||
          `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318"}/v1/metrics`,
      })
    : new ConsoleMetricExporter(),
  exportIntervalMillis: isProd ? 60_000 : 30_000,
});

// --- Log Processor ---
const logProcessor = isProd
  ? new BatchLogRecordProcessor(
      new OTLPLogExporter({
        url:
          process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ||
          `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318"}/v1/logs`,
      }),
    )
  : new SimpleLogRecordProcessor(new ConsoleLogRecordExporter());

const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader,
  logRecordProcessor: logProcessor,
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-pg": {
        enhancedDatabaseReporting: !isProd,
      },
      "@opentelemetry/instrumentation-http": {
        enabled: true,
      },
      "@opentelemetry/instrumentation-fastify": {
        enabled: true,
      },
      "@opentelemetry/instrumentation-pino": {
        enabled: true,
      },
      // Disable noisy instrumentations
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
    }),
  ],
});

sdk.start();

// Graceful shutdown
const shutdown = async () => {
  try {
    await sdk.shutdown();
  } catch (err) {
    console.error("OTel SDK shutdown error:", err);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { sdk };
