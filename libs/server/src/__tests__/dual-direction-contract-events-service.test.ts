import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted mocks
const {
  mockForwardStart,
  mockForwardStop,
  mockForwardGetStatus,
  mockForwardRunEtlNow,
  mockForwardProcessEventsNow,
  mockForwardUpdateConfig,
  mockBackwardStart,
  mockBackwardStop,
  mockBackwardGetStatus,
  mockBackwardRunEtlNow,
  mockBackwardProcessEventsNow,
  mockBackwardUpdateConfig,
} = vi.hoisted(() => ({
  mockForwardStart: vi.fn(),
  mockForwardStop: vi.fn(),
  mockForwardGetStatus: vi.fn(),
  mockForwardRunEtlNow: vi.fn(),
  mockForwardProcessEventsNow: vi.fn(),
  mockForwardUpdateConfig: vi.fn(),
  mockBackwardStart: vi.fn(),
  mockBackwardStop: vi.fn(),
  mockBackwardGetStatus: vi.fn(),
  mockBackwardRunEtlNow: vi.fn(),
  mockBackwardProcessEventsNow: vi.fn(),
  mockBackwardUpdateConfig: vi.fn(),
}));

// Mock the scheduler - must use class syntax for `new ContractEventsScheduler()`
vi.mock("../solana/services/contract-events-scheduler", () => {
  class MockContractEventsScheduler {
    config: any;
    start: any;
    stop: any;
    getStatus: any;
    runEtlNow: any;
    processEventsNow: any;
    updateConfig: any;
    constructor(_db: any, config: any) {
      this.config = config;
      const isForward = config.direction === "forward";
      this.start = isForward ? mockForwardStart : mockBackwardStart;
      this.stop = isForward ? mockForwardStop : mockBackwardStop;
      this.getStatus = isForward ? mockForwardGetStatus : mockBackwardGetStatus;
      this.runEtlNow = isForward ? mockForwardRunEtlNow : mockBackwardRunEtlNow;
      this.processEventsNow = isForward ? mockForwardProcessEventsNow : mockBackwardProcessEventsNow;
      this.updateConfig = isForward ? mockForwardUpdateConfig : mockBackwardUpdateConfig;
    }
  }
  return { ContractEventsScheduler: MockContractEventsScheduler };
});

// Mock db
vi.mock("../db", () => ({
  db: {},
}));

// Mock config
vi.mock("../config/config", () => ({
  config: {
    solanaRpcUrl: "https://test-rpc.com",
  },
}));

// Mock contract-utils
vi.mock("../solana/services/contract-utils", () => ({
  MULTI_HOPPER_PROGRAM_ID: {
    toBase58: () => "TestProgramId11111111111111111111111111111",
  },
}));

// Mock logger
vi.mock("@libs/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { DualDirectionContractEventsService } from "../solana/services/dual-direction-contract-events.service";
import type { DualDirectionConfig } from "../solana/services/dual-direction-contract-events.service";

const makeConfig = (
  overrides: Partial<DualDirectionConfig> = {}
): DualDirectionConfig => ({
  rpcUrl: "https://test-rpc.com",
  programId: "TestProgramId11111111111111111111111111111",
  forwardConfig: {
    etlIntervalMs: 60000,
    processingIntervalMs: 15000,
    enabled: true,
    ...overrides.forwardConfig,
  },
  backwardConfig: {
    etlIntervalMs: 120000,
    processingIntervalMs: 15000,
    enabled: true,
    ...overrides.backwardConfig,
  },
  ...overrides,
});

describe("DualDirectionContractEventsService", () => {
  let service: DualDirectionContractEventsService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    service = new DualDirectionContractEventsService(makeConfig());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initialize", () => {
    it("should start both schedulers when enabled", async () => {
      mockForwardStart.mockResolvedValue(undefined);
      mockBackwardStart.mockResolvedValue(undefined);

      const initPromise = service.initialize();
      await vi.advanceTimersByTimeAsync(6000);
      await initPromise;

      expect(mockForwardStart).toHaveBeenCalled();
      expect(mockBackwardStart).toHaveBeenCalled();
      expect(service.isReady()).toBe(true);
    });

    it("should not re-initialize if already initialized", async () => {
      mockForwardStart.mockResolvedValue(undefined);
      mockBackwardStart.mockResolvedValue(undefined);

      const initPromise = service.initialize();
      await vi.advanceTimersByTimeAsync(6000);
      await initPromise;
      await service.initialize(); // Second call - returns immediately

      // Should only be called once each
      expect(mockForwardStart).toHaveBeenCalledTimes(1);
      expect(mockBackwardStart).toHaveBeenCalledTimes(1);
    });

    it("should skip disabled schedulers", async () => {
      const svc = new DualDirectionContractEventsService(
        makeConfig({
          forwardConfig: { etlIntervalMs: 60000, processingIntervalMs: 15000, enabled: false },
          backwardConfig: { etlIntervalMs: 120000, processingIntervalMs: 15000, enabled: false },
        })
      );

      await svc.initialize();

      expect(mockForwardStart).not.toHaveBeenCalled();
      expect(mockBackwardStart).not.toHaveBeenCalled();
    });

    it("should throw on initialization error", async () => {
      mockForwardStart.mockRejectedValue(new Error("Start failed"));

      await expect(service.initialize()).rejects.toThrow("Start failed");
    });
  });

  describe("shutdown", () => {
    it("should stop both schedulers", async () => {
      mockForwardStart.mockResolvedValue(undefined);
      mockBackwardStart.mockResolvedValue(undefined);
      mockForwardStop.mockResolvedValue(undefined);
      mockBackwardStop.mockResolvedValue(undefined);

      const initPromise = service.initialize();
      await vi.advanceTimersByTimeAsync(6000);
      await initPromise;
      await service.shutdown();

      expect(mockForwardStop).toHaveBeenCalled();
      expect(mockBackwardStop).toHaveBeenCalled();
      expect(service.isReady()).toBe(false);
    });

    it("should do nothing if not initialized", async () => {
      await service.shutdown();

      expect(mockForwardStop).not.toHaveBeenCalled();
      expect(mockBackwardStop).not.toHaveBeenCalled();
    });
  });

  describe("getStatus", () => {
    it("should return status from both schedulers", async () => {
      mockForwardGetStatus.mockResolvedValue({ running: true });
      mockBackwardGetStatus.mockResolvedValue({ running: false });

      const status = await service.getStatus();

      expect(status.forward).toBeDefined();
      expect(status.backward).toBeDefined();
      expect(status.coverage).toBeDefined();
    });
  });

  describe("runEtlNow", () => {
    it("should run ETL for both directions", async () => {
      mockForwardRunEtlNow.mockResolvedValue({ success: true });
      mockBackwardRunEtlNow.mockResolvedValue({ success: true });

      const result = await service.runEtlNow();

      expect(result.forward).toEqual({ success: true });
      expect(result.backward).toEqual({ success: true });
    });

    it("should handle errors gracefully", async () => {
      mockForwardRunEtlNow.mockRejectedValue(new Error("ETL failed"));
      mockBackwardRunEtlNow.mockResolvedValue({ success: true });

      const result = await service.runEtlNow();

      expect(result.forward).toEqual(
        expect.objectContaining({ success: false, error: "ETL failed" })
      );
      expect(result.backward).toEqual({ success: true });
    });
  });

  describe("processEventsNow", () => {
    it("should process events for both directions", async () => {
      mockForwardProcessEventsNow.mockResolvedValue({
        processed: 5,
        errors: [],
      });
      mockBackwardProcessEventsNow.mockResolvedValue({
        processed: 3,
        errors: [],
      });

      const result = await service.processEventsNow();

      expect(result.total.processed).toBe(8);
      expect(result.total.errors).toEqual([]);
    });
  });

  describe("isReady", () => {
    it("should return false before initialization", () => {
      expect(service.isReady()).toBe(false);
    });

    it("should return true after initialization", async () => {
      mockForwardStart.mockResolvedValue(undefined);
      mockBackwardStart.mockResolvedValue(undefined);

      const initPromise = service.initialize();
      await vi.advanceTimersByTimeAsync(6000);
      await initPromise;
      expect(service.isReady()).toBe(true);
    });
  });

  describe("updateConfig", () => {
    it("should update forward config", () => {
      service.updateConfig({
        forwardConfig: {
          etlIntervalMs: 30000,
          processingIntervalMs: 5000,
          enabled: true,
        },
      });

      expect(mockForwardUpdateConfig).toHaveBeenCalledWith({
        etlIntervalMs: 30000,
        processingIntervalMs: 5000,
        enabled: true,
      });
    });

    it("should update backward config", () => {
      service.updateConfig({
        backwardConfig: {
          etlIntervalMs: 60000,
          processingIntervalMs: 10000,
          enabled: false,
        },
      });

      expect(mockBackwardUpdateConfig).toHaveBeenCalledWith({
        etlIntervalMs: 60000,
        processingIntervalMs: 10000,
        enabled: false,
      });
    });
  });

  describe("getForwardScheduler / getBackwardScheduler", () => {
    it("should return the scheduler instances", () => {
      expect(service.getForwardScheduler()).toBeDefined();
      expect(service.getBackwardScheduler()).toBeDefined();
    });
  });
});
