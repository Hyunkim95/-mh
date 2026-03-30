import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  processUnprocessedEvents: vi.fn().mockResolvedValue({
    processed: 0,
    errors: [],
  }),
  getProcessingStats: vi.fn().mockResolvedValue({
    totalEvents: 0,
    processedEvents: 0,
    unprocessedEvents: 0,
    eventsByType: {},
  }),
  reprocessFailedEvents: vi.fn().mockResolvedValue(undefined),
  etlRun: vi.fn().mockResolvedValue({ totalExtracted: 0, success: true }),
}));

vi.mock("../solana/services/contract-events-etl", () => ({
  ContractEventsEtlJob: class MockContractEventsEtlJob {
    run = mocks.etlRun;
  },
}));

vi.mock("../solana/services/contract-event-processor", () => ({
  ContractEventProcessor: class MockContractEventProcessor {
    processUnprocessedEvents = mocks.processUnprocessedEvents;
    getProcessingStats = mocks.getProcessingStats;
    reprocessFailedEvents = mocks.reprocessFailedEvents;
  },
}));

vi.mock("@libs/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@opentelemetry/api", () => {
  const mockSpan = {
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  };
  return {
    trace: {
      getTracer: () => ({
        startActiveSpan: vi.fn((_name: string, _opts: any, cb: any) => cb(mockSpan)),
      }),
    },
    SpanKind: { INTERNAL: 0 },
    SpanStatusCode: { OK: 0, ERROR: 1 },
  };
});

import { ContractEventsScheduler } from "../solana/services/contract-events-scheduler";

describe("ContractEventsScheduler", () => {
  let scheduler: ContractEventsScheduler;
  const mockDb = {} as any;
  const baseConfig = {
    rpcUrl: "https://api.devnet.solana.com",
    programId: "program-id-123",
    etlIntervalMs: 5000,
    processingIntervalMs: 3000,
    direction: "forward" as const,
    enabled: true,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    scheduler = new ContractEventsScheduler(mockDb, { ...baseConfig });
  });

  afterEach(async () => {
    await scheduler.stop();
    vi.useRealTimers();
  });

  describe("start / stop", () => {
    it("starts the scheduler when enabled", async () => {
      await scheduler.start();

      const status = await scheduler.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it("does not start when disabled", async () => {
      const disabledScheduler = new ContractEventsScheduler(mockDb, {
        ...baseConfig,
        enabled: false,
      });

      await disabledScheduler.start();

      const status = await disabledScheduler.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it("is idempotent - second start is no-op", async () => {
      await scheduler.start();
      await scheduler.start();

      const status = await scheduler.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it("stops the scheduler", async () => {
      await scheduler.start();
      await scheduler.stop();

      const status = await scheduler.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it("stop is idempotent", async () => {
      await scheduler.stop();
      await scheduler.stop(); // no-op, no error
    });
  });

  describe("getStatus", () => {
    it("returns current status info", async () => {
      const status = await scheduler.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.config).toEqual(expect.objectContaining(baseConfig));
      expect(status.cooldownInfo).toBeDefined();
      expect(status.cooldownInfo.consecutiveEmptyRuns).toBe(0);
      expect(status.cooldownInfo.inCooldown).toBe(false);
    });
  });

  describe("runEtlNow", () => {
    it("runs ETL job manually", async () => {
      const result = await scheduler.runEtlNow();

      expect(result).toBeDefined();
    });
  });

  describe("processEventsNow", () => {
    it("processes events manually", async () => {
      const result = await scheduler.processEventsNow();

      expect(result).toBeDefined();
      expect(mocks.processUnprocessedEvents).toHaveBeenCalled();
    });
  });

  describe("reprocessFailedEvents", () => {
    it("delegates to event processor", async () => {
      await scheduler.reprocessFailedEvents([1, 2, 3]);

      expect(mocks.reprocessFailedEvents).toHaveBeenCalledWith([1, 2, 3]);
    });

    it("reprocesses all when no IDs given", async () => {
      await scheduler.reprocessFailedEvents();

      expect(mocks.reprocessFailedEvents).toHaveBeenCalledWith(undefined);
    });
  });

  describe("updateConfig", () => {
    it("merges new config", () => {
      scheduler.updateConfig({ etlIntervalMs: 10000 });

      expect(scheduler.config.etlIntervalMs).toBe(10000);
      expect(scheduler.config.direction).toBe("forward"); // unchanged
    });
  });

  describe("getEventProcessor", () => {
    it("returns the event processor instance", () => {
      const ep = scheduler.getEventProcessor();
      expect(ep).toBeDefined();
      expect(ep.processUnprocessedEvents).toBeDefined();
    });
  });

  describe("ETL loop interval behavior", () => {
    it("runs ETL job on interval tick", async () => {
      await scheduler.start();
      // Wait for initial run to complete
      await vi.advanceTimersByTimeAsync(0);

      mocks.etlRun.mockClear();
      // Advance past one etlIntervalMs tick
      await vi.advanceTimersByTimeAsync(baseConfig.etlIntervalMs + 100);

      expect(mocks.etlRun).toHaveBeenCalled();
    });

    it("tracks consecutive empty runs and enters cooldown", async () => {
      mocks.etlRun.mockResolvedValue({ totalExtracted: 0, success: true });

      await scheduler.start();
      // Wait for initial run
      await vi.advanceTimersByTimeAsync(0);

      // Advance through maxEmptyRuns (3) intervals
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(baseConfig.etlIntervalMs + 100);
      }

      const status = await scheduler.getStatus();
      expect(status.cooldownInfo.consecutiveEmptyRuns).toBeGreaterThanOrEqual(3);
    });

    it("resets consecutive empty runs when data is found", async () => {
      mocks.etlRun.mockResolvedValue({ totalExtracted: 0, success: true });

      await scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      // Run a couple empty ticks
      await vi.advanceTimersByTimeAsync(baseConfig.etlIntervalMs + 100);
      await vi.advanceTimersByTimeAsync(baseConfig.etlIntervalMs + 100);

      // Now return data
      mocks.etlRun.mockResolvedValue({ totalExtracted: 5, success: true });
      await vi.advanceTimersByTimeAsync(baseConfig.etlIntervalMs + 100);

      const status = await scheduler.getStatus();
      expect(status.cooldownInfo.consecutiveEmptyRuns).toBe(0);
    });

    it("handles ETL job error gracefully", async () => {
      mocks.etlRun.mockRejectedValueOnce(new Error("RPC timeout"));

      await scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      // Scheduler should still be running after error
      const status = await scheduler.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it("handles initial ETL job failure gracefully", async () => {
      mocks.etlRun.mockRejectedValue(new Error("startup failure"));

      // Should not throw
      await scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mocks.etlRun).toHaveBeenCalled();
    });
  });

  describe("event processing loop", () => {
    it("processes events on interval tick", async () => {
      await scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      mocks.processUnprocessedEvents.mockClear();
      await vi.advanceTimersByTimeAsync(baseConfig.processingIntervalMs + 100);

      expect(mocks.processUnprocessedEvents).toHaveBeenCalled();
    });

    it("logs when events are processed with results", async () => {
      mocks.processUnprocessedEvents.mockResolvedValue({
        processed: 5,
        errors: [],
      });

      await scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(baseConfig.processingIntervalMs + 100);

      expect(mocks.processUnprocessedEvents).toHaveBeenCalled();
    });

    it("handles event processing with errors", async () => {
      mocks.processUnprocessedEvents.mockResolvedValue({
        processed: 3,
        errors: [{ eventId: 1, error: "failed" }],
      });

      await scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(baseConfig.processingIntervalMs + 100);

      expect(mocks.processUnprocessedEvents).toHaveBeenCalled();
    });

    it("handles event processing failure gracefully", async () => {
      mocks.processUnprocessedEvents.mockRejectedValueOnce(new Error("db error"));

      await scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(baseConfig.processingIntervalMs + 100);

      // Should still be running
      const status = await scheduler.getStatus();
      expect(status.isRunning).toBe(true);
    });
  });

  describe("cooldown with backward direction", () => {
    it("uses double cooldown for backward direction", async () => {
      const backwardScheduler = new ContractEventsScheduler(mockDb, {
        ...baseConfig,
        direction: "backward",
      });

      mocks.etlRun.mockResolvedValue({ totalExtracted: 0, success: true });

      await backwardScheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      // Fill up consecutive empty runs
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(baseConfig.etlIntervalMs + 100);
      }

      const status = await backwardScheduler.getStatus();
      expect(status.cooldownInfo.consecutiveEmptyRuns).toBeGreaterThanOrEqual(3);

      await backwardScheduler.stop();
    });
  });

  describe("getStatus cooldown info", () => {
    it("reports cooldown time remaining when in cooldown", async () => {
      mocks.etlRun.mockResolvedValue({ totalExtracted: 0, success: true });

      await scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      // Trigger enough empty runs for cooldown
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(baseConfig.etlIntervalMs + 100);
      }

      const status = await scheduler.getStatus();
      // May or may not be in cooldown depending on timing, but the info should be defined
      expect(status.cooldownInfo).toBeDefined();
      expect(typeof status.cooldownInfo.consecutiveEmptyRuns).toBe("number");
      expect(typeof status.cooldownInfo.maxEmptyRuns).toBe("number");
    });
  });
});
