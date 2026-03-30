import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pino before importing logger
const mockChild = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("pino", () => ({
  default: vi.fn(() => ({
    child: vi.fn(() => mockChild),
  })),
}));

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getActiveSpan: vi.fn(),
  },
}));

import { createLogger, getTraceContext } from "../logger";
import { trace } from "@opentelemetry/api";

describe("createLogger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a logger with all log levels", () => {
    const logger = createLogger("TestContext");
    expect(logger).toHaveProperty("debug");
    expect(logger).toHaveProperty("info");
    expect(logger).toHaveProperty("warn");
    expect(logger).toHaveProperty("error");
  });

  it("logs a simple message", () => {
    const logger = createLogger("Test");
    logger.info("hello world");
    expect(mockChild.info).toHaveBeenCalledWith("hello world");
  });

  it("logs with object argument (pino-style: obj first, msg second)", () => {
    const logger = createLogger("Test");
    const data = { userId: 123 };
    logger.info("user event", data);
    expect(mockChild.info).toHaveBeenCalledWith(data, "user event");
  });

  it("logs with multiple non-object args as extra", () => {
    const logger = createLogger("Test");
    logger.warn("multiple", "arg1", "arg2");
    expect(mockChild.warn).toHaveBeenCalledWith(
      { extra: ["arg1", "arg2"] },
      "multiple"
    );
  });

  it("calls correct log level method", () => {
    const logger = createLogger("Test");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(mockChild.debug).toHaveBeenCalledWith("d");
    expect(mockChild.info).toHaveBeenCalledWith("i");
    expect(mockChild.warn).toHaveBeenCalledWith("w");
    expect(mockChild.error).toHaveBeenCalledWith("e");
  });
});

describe("getTraceContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined when no active span", () => {
    vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);
    expect(getTraceContext()).toBeUndefined();
  });

  it("returns traceId and spanId from active span", () => {
    vi.mocked(trace.getActiveSpan).mockReturnValue({
      spanContext: () => ({
        traceId: "abc123",
        spanId: "def456",
        traceFlags: 0,
      }),
    } as any);

    const ctx = getTraceContext();
    expect(ctx).toEqual({ traceId: "abc123", spanId: "def456" });
  });
});
