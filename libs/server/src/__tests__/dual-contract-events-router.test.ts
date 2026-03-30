import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  runEtlNow: vi.fn(),
  processEventsNow: vi.fn(),
  updateConfig: vi.fn(),
  isReady: vi.fn(),
  getForwardScheduler: vi.fn(),
  getBackwardScheduler: vi.fn(),
}));

vi.mock("../solana/services/dual-direction-contract-events.service", () => ({
  dualDirectionContractEventsService: {
    getStatus: mocks.getStatus,
    runEtlNow: mocks.runEtlNow,
    processEventsNow: mocks.processEventsNow,
    updateConfig: mocks.updateConfig,
    isReady: mocks.isReady,
    getForwardScheduler: mocks.getForwardScheduler,
    getBackwardScheduler: mocks.getBackwardScheduler,
  },
}));

import { dualContractEventsRouter } from "../routers/dual-contract-events.router";

const protectedCaller = dualContractEventsRouter.createCaller({
  user: { publicKey: "11111111111111111111111111111111" },
} as any);
const adminCaller = dualContractEventsRouter.createCaller({
  user: { publicKey: "11111111111111111111111111111111", role: "admin" },
} as any);
const unauthenticatedCaller = dualContractEventsRouter.createCaller({
  user: null,
} as any);

describe("dualContractEventsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getStatus", () => {
    it("requires authentication", async () => {
      await expect(unauthenticatedCaller.getStatus()).rejects.toThrow(
        "UNAUTHORIZED"
      );
    });

    it("returns service status", async () => {
      mocks.getStatus.mockResolvedValue({
        forward: { isRunning: true },
        backward: { isRunning: false },
      });

      const result = await protectedCaller.getStatus();

      expect(result.forward.isRunning).toBe(true);
      expect(result.backward.isRunning).toBe(false);
    });

    it("throws TRPCError on failure", async () => {
      mocks.getStatus.mockRejectedValue(new Error("service down"));

      await expect(protectedCaller.getStatus()).rejects.toThrow();
    });
  });

  describe("runEtlNow", () => {
    it("runs ETL for both directions", async () => {
      mocks.runEtlNow.mockResolvedValue({ forward: "ok", backward: "ok" });

      const result = await adminCaller.runEtlNow({ direction: "both" });

      expect(result.success).toBe(true);
      expect(mocks.runEtlNow).toHaveBeenCalled();
    });

    it("runs ETL for forward direction only", async () => {
      const mockScheduler = { runEtlNow: vi.fn().mockResolvedValue("ok") };
      mocks.getForwardScheduler.mockReturnValue(mockScheduler);

      const result = await adminCaller.runEtlNow({ direction: "forward" });

      expect(result.success).toBe(true);
      expect(mockScheduler.runEtlNow).toHaveBeenCalled();
    });

    it("runs ETL for backward direction only", async () => {
      const mockScheduler = { runEtlNow: vi.fn().mockResolvedValue("ok") };
      mocks.getBackwardScheduler.mockReturnValue(mockScheduler);

      const result = await adminCaller.runEtlNow({ direction: "backward" });

      expect(result.success).toBe(true);
      expect(mockScheduler.runEtlNow).toHaveBeenCalled();
    });
  });

  describe("processEventsNow", () => {
    it("processes events for both directions", async () => {
      mocks.processEventsNow.mockResolvedValue({});

      const result = await adminCaller.processEventsNow({ direction: "both" });

      expect(result.success).toBe(true);
    });

    it("processes events for specific direction", async () => {
      const mockScheduler = {
        processEventsNow: vi.fn().mockResolvedValue("ok"),
      };
      mocks.getForwardScheduler.mockReturnValue(mockScheduler);

      const result = await adminCaller.processEventsNow({ direction: "forward" });

      expect(result.success).toBe(true);
    });
  });

  describe("updateConfig", () => {
    it("updates configuration", async () => {
      const result = await adminCaller.updateConfig({
        forwardConfig: { etlIntervalMs: 5000 },
      });

      expect(result.success).toBe(true);
      expect(mocks.updateConfig).toHaveBeenCalled();
    });
  });

  describe("getProcessingStats", () => {
    it("returns combined stats", async () => {
      const mockForwardProcessor = {
        getProcessingStats: vi.fn().mockResolvedValue({
          totalEvents: 100,
          processedEvents: 90,
          unprocessedEvents: 10,
          eventsByType: { hopCompleted: 50, routeCreated: 40 },
        }),
      };
      const mockBackwardProcessor = {
        getProcessingStats: vi.fn().mockResolvedValue({
          totalEvents: 50,
          processedEvents: 45,
          unprocessedEvents: 5,
          eventsByType: { hopCompleted: 30, routeCreated: 15 },
        }),
      };

      mocks.getForwardScheduler.mockReturnValue({
        getEventProcessor: () => mockForwardProcessor,
      });
      mocks.getBackwardScheduler.mockReturnValue({
        getEventProcessor: () => mockBackwardProcessor,
      });

      const result = await protectedCaller.getProcessingStats();

      expect(result.combined.totalEvents).toBe(150);
      expect(result.combined.processedEvents).toBe(135);
      expect(result.combined.unprocessedEvents).toBe(15);
    });
  });

  describe("isReady", () => {
    it("returns readiness status", async () => {
      mocks.isReady.mockReturnValue(true);

      const result = await protectedCaller.isReady();

      expect(result).toEqual({ ready: true });
    });
  });

  describe("getCursors", () => {
    it("returns cursor info", async () => {
      const result = await protectedCaller.getCursors();

      expect(result.forward).toBeDefined();
      expect(result.backward).toBeDefined();
    });
  });

  describe("resetCursor", () => {
    it("requires confirmation", async () => {
      await expect(
        adminCaller.resetCursor({ direction: "forward", confirm: false })
      ).rejects.toThrow("requires confirmation");
    });

    it("resets cursor when confirmed", async () => {
      const result = await adminCaller.resetCursor({
        direction: "forward",
        confirm: true,
      });

      expect(result.success).toBe(true);
    });
  });
});
