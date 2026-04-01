import { describe, it, expect, vi, beforeEach } from "vitest";
import BN from "bn.js";

// Hoisted mocks
const {
  mockGetOverdueHops,
  mockMarkAllHopsCompleted,
  mockUpdateHopExecutionByIndex,
  mockUpdateHopScheduleByIndex,
  mockGetRouteById,
  mockUpdateRouteStatus,
  mockGetRouteStateAccount,
  mockGetRouteConfiguration,
  mockExecuteHop,
  mockGetSessionByRouteId,
  mockUtcNow,
} = vi.hoisted(() => ({
  mockGetOverdueHops: vi.fn(),
  mockMarkAllHopsCompleted: vi.fn(),
  mockUpdateHopExecutionByIndex: vi.fn(),
  mockUpdateHopScheduleByIndex: vi.fn(),
  mockGetRouteById: vi.fn(),
  mockUpdateRouteStatus: vi.fn(),
  mockGetRouteStateAccount: vi.fn(),
  mockGetRouteConfiguration: vi.fn(),
  mockExecuteHop: vi.fn(),
  mockGetSessionByRouteId: vi.fn(),
  mockUtcNow: vi.fn(() => new Date("2024-06-01T12:00:00Z")),
}));

// Mock hops service
vi.mock("../hops/services/hops.service", () => ({
  hopsService: {
    getOverdueHops: mockGetOverdueHops,
    markAllHopsCompleted: mockMarkAllHopsCompleted,
    updateHopExecutionByIndex: mockUpdateHopExecutionByIndex,
    updateHopScheduleByIndex: mockUpdateHopScheduleByIndex,
  },
}));

// Mock routes service
vi.mock("../routes/services/routes.service", () => ({
  default: {
    getRouteById: mockGetRouteById,
    updateRouteStatus: mockUpdateRouteStatus,
  },
}));

// Mock contract service
vi.mock("../solana/services/contract.service", () => ({
  default: {
    executeHop: mockExecuteHop,
  },
  getRouteStateAccount: mockGetRouteStateAccount,
}));

// Mock contract-utils
vi.mock("../solana/services/contract-utils", () => ({
  getRouteConfiguration: mockGetRouteConfiguration,
}));

// Mock obfuscation
vi.mock("../obfuscation", () => ({
  obfuscationService: {
    getSessionByRouteId: mockGetSessionByRouteId,
  },
}));

// Mock timezone
vi.mock("../utils/timezone", () => ({
  utcNow: mockUtcNow,
}));

// Mock cron - must use class syntax for `new CronJob()`
vi.mock("cron", () => {
  class MockCronJob {
    _fn: any;
    constructor(_pattern: string, fn: any) {
      this._fn = fn;
    }
    start = vi.fn();
    stop = vi.fn();
  }
  return { CronJob: MockCronJob };
});

// Mock logger
vi.mock("@libs/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import AFTER mocks
import { triggerHopJob } from "../hops/services/hops-scheduler.service";

describe("hops-scheduler.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Access the internal trigger function via the CronJob mock
  const getTriggerFn = () => (triggerHopJob as any)._fn;

  describe("_triggerHop", () => {
    it("should skip when no overdue hops", async () => {
      mockGetOverdueHops.mockResolvedValue([]);

      await getTriggerFn()();

      expect(mockGetOverdueHops).toHaveBeenCalled();
      expect(mockGetRouteById).not.toHaveBeenCalled();
    });

    it("should skip routes not found in DB", async () => {
      mockGetOverdueHops.mockResolvedValue([
        { routeId: 1, hopIndex: 0 },
      ]);
      mockGetRouteById.mockResolvedValue(null);

      await getTriggerFn()();

      expect(mockGetRouteById).toHaveBeenCalledWith(1);
      expect(mockGetRouteStateAccount).not.toHaveBeenCalled();
    });

    it("should skip routes with pending obfuscation", async () => {
      mockGetOverdueHops.mockResolvedValue([
        { routeId: 1, hopIndex: 0 },
      ]);
      mockGetRouteById.mockResolvedValue({
        id: 1,
        routeId: 100,
        creator: "c1",
        hasObfuscation: true,
      });
      mockGetSessionByRouteId.mockResolvedValue({ status: "pending" });

      await getTriggerFn()();

      expect(mockGetSessionByRouteId).toHaveBeenCalledWith(1);
      expect(mockGetRouteStateAccount).not.toHaveBeenCalled();
    });

    it("should proceed with obfuscation routes that are completed", async () => {
      mockGetOverdueHops.mockResolvedValue([
        { routeId: 1, hopIndex: 0 },
      ]);
      mockGetRouteById.mockResolvedValue({
        id: 1,
        routeId: 100,
        creator: "c1",
        hasObfuscation: true,
      });
      mockGetSessionByRouteId.mockResolvedValue({ status: "completed" });
      mockGetRouteStateAccount.mockResolvedValue({
        currentHopIndex: 0,
        hopsCount: 2,
      });
      mockGetRouteConfiguration.mockResolvedValue({
        hops: [
          { executeAt: new BN(0) },
          { executeAt: new BN(999999999) },
        ],
      });
      mockExecuteHop.mockResolvedValue("txSig");
      mockUpdateHopExecutionByIndex.mockResolvedValue({});

      await getTriggerFn()();

      expect(mockExecuteHop).toHaveBeenCalled();
      expect(mockUpdateHopExecutionByIndex).toHaveBeenCalledWith(
        1,
        0,
        expect.objectContaining({ txHash: "txSig" })
      );
    });

    it("should resume from the current hop when the scheduler runs twice", async () => {
      mockGetOverdueHops
        .mockResolvedValueOnce([{ routeId: 1, hopIndex: 0 }])
        .mockResolvedValueOnce([{ routeId: 1, hopIndex: 1 }]);
      mockGetRouteById.mockResolvedValue({
        id: 1,
        routeId: 100,
        creator: "c1",
        hasObfuscation: false,
      });
      mockGetRouteStateAccount
        .mockResolvedValueOnce({ currentHopIndex: 0, hopsCount: 2 })
        .mockResolvedValueOnce({ currentHopIndex: 1, hopsCount: 2 });
      mockGetRouteConfiguration.mockResolvedValue({
        hops: [{ executeAt: new BN(0) }, { executeAt: new BN(0) }],
      });
      mockExecuteHop
        .mockResolvedValueOnce("txSig-1")
        .mockResolvedValueOnce("txSig-2");
      mockUpdateHopExecutionByIndex.mockResolvedValue({});

      await getTriggerFn()();
      await getTriggerFn()();

      expect(mockExecuteHop).toHaveBeenCalledTimes(2);
      expect(mockUpdateHopExecutionByIndex).toHaveBeenNthCalledWith(
        1,
        1,
        0,
        expect.objectContaining({ txHash: "txSig-1" })
      );
      expect(mockUpdateHopExecutionByIndex).toHaveBeenNthCalledWith(
        2,
        1,
        1,
        expect.objectContaining({ txHash: "txSig-2" })
      );
      expect(mockMarkAllHopsCompleted).toHaveBeenCalledWith(1);
      expect(mockUpdateRouteStatus).toHaveBeenCalledWith(1, "c1", "completed");
    });

    it("should mark route as completed when all hops done", async () => {
      mockGetOverdueHops.mockResolvedValue([
        { routeId: 1, hopIndex: 0 },
      ]);
      mockGetRouteById.mockResolvedValue({
        id: 1,
        routeId: 100,
        creator: "c1",
        hasObfuscation: false,
      });
      mockGetRouteStateAccount.mockResolvedValue({
        currentHopIndex: 3,
        hopsCount: 3, // lastHopIndex = 2, currentHop (3) > lastHopIndex (2)
      });

      await getTriggerFn()();

      expect(mockMarkAllHopsCompleted).toHaveBeenCalledWith(1);
      expect(mockUpdateRouteStatus).toHaveBeenCalledWith(1, "c1", "completed");
    });

    it("should mark route completed when executeHop returns null", async () => {
      mockGetOverdueHops.mockResolvedValue([
        { routeId: 1, hopIndex: 0 },
      ]);
      mockGetRouteById.mockResolvedValue({
        id: 1,
        routeId: 100,
        creator: "c1",
        hasObfuscation: false,
      });
      mockGetRouteStateAccount.mockResolvedValue({
        currentHopIndex: 0,
        hopsCount: 2,
      });
      mockGetRouteConfiguration.mockResolvedValue({
        hops: [{ executeAt: new BN(0) }, { executeAt: new BN(0) }],
      });
      mockExecuteHop.mockResolvedValue(null);

      await getTriggerFn()();

      expect(mockMarkAllHopsCompleted).toHaveBeenCalledWith(1);
      expect(mockUpdateRouteStatus).toHaveBeenCalledWith(1, "c1", "completed");
    });

    it("should record error when hop execution fails", async () => {
      mockGetOverdueHops.mockResolvedValue([
        { routeId: 1, hopIndex: 0 },
      ]);
      mockGetRouteById.mockResolvedValue({
        id: 1,
        routeId: 100,
        creator: "c1",
        hasObfuscation: false,
      });
      mockGetRouteStateAccount.mockResolvedValue({
        currentHopIndex: 0,
        hopsCount: 2,
      });
      mockGetRouteConfiguration.mockResolvedValue({
        hops: [{ executeAt: new BN(0) }, { executeAt: new BN(0) }],
      });
      mockExecuteHop.mockRejectedValue(new Error("Execution failed"));

      await getTriggerFn()();

      expect(mockUpdateHopExecutionByIndex).toHaveBeenCalledWith(
        1,
        0,
        expect.objectContaining({ error: "Execution failed" })
      );
    });

    it("should handle routes with no on-chain configuration", async () => {
      mockGetOverdueHops.mockResolvedValue([
        { routeId: 1, hopIndex: 0 },
      ]);
      mockGetRouteById.mockResolvedValue({
        id: 1,
        routeId: 100,
        creator: "c1",
        hasObfuscation: false,
      });
      mockGetRouteStateAccount.mockResolvedValue({
        currentHopIndex: 0,
        hopsCount: 2,
      });
      mockGetRouteConfiguration.mockResolvedValue({ hops: [] });

      await getTriggerFn()();

      // Should not try to execute hop
      expect(mockExecuteHop).not.toHaveBeenCalled();
    });

    it("should mark route completed immediately after executing last hop", async () => {
      mockGetOverdueHops.mockResolvedValue([
        { routeId: 1, hopIndex: 1 },
      ]);
      mockGetRouteById.mockResolvedValue({
        id: 1,
        routeId: 100,
        creator: "c1",
        hasObfuscation: false,
      });
      // currentHopIndex = 1, hopsCount = 2 → lastHopIndex = 1
      // This means we're about to execute the LAST hop
      mockGetRouteStateAccount.mockResolvedValue({
        currentHopIndex: 1,
        hopsCount: 2,
      });
      mockGetRouteConfiguration.mockResolvedValue({
        hops: [{ executeAt: new BN(0) }, { executeAt: new BN(0) }],
      });
      mockExecuteHop.mockResolvedValue("lastHopTxSig");
      mockUpdateHopExecutionByIndex.mockResolvedValue({});
      mockMarkAllHopsCompleted.mockResolvedValue(undefined);
      mockUpdateRouteStatus.mockResolvedValue(undefined);

      await getTriggerFn()();

      // Should execute the hop
      expect(mockExecuteHop).toHaveBeenCalled();
      expect(mockUpdateHopExecutionByIndex).toHaveBeenCalledWith(
        1,
        1,
        expect.objectContaining({ txHash: "lastHopTxSig" })
      );
      // Should immediately mark as completed (not wait for next scheduler tick)
      expect(mockMarkAllHopsCompleted).toHaveBeenCalledWith(1);
      expect(mockUpdateRouteStatus).toHaveBeenCalledWith(1, "c1", "completed");
    });

    it("should NOT mark route completed after executing a non-last hop", async () => {
      mockGetOverdueHops.mockResolvedValue([
        { routeId: 1, hopIndex: 0 },
      ]);
      mockGetRouteById.mockResolvedValue({
        id: 1,
        routeId: 100,
        creator: "c1",
        hasObfuscation: false,
      });
      // currentHopIndex = 0, hopsCount = 3 → lastHopIndex = 2
      // First hop, not the last
      mockGetRouteStateAccount.mockResolvedValue({
        currentHopIndex: 0,
        hopsCount: 3,
      });
      mockGetRouteConfiguration.mockResolvedValue({
        hops: [{ executeAt: new BN(0) }, { executeAt: new BN(0) }, { executeAt: new BN(0) }],
      });
      mockExecuteHop.mockResolvedValue("hopTxSig");
      mockUpdateHopExecutionByIndex.mockResolvedValue({});

      await getTriggerFn()();

      // Should execute the hop
      expect(mockExecuteHop).toHaveBeenCalled();
      expect(mockUpdateHopExecutionByIndex).toHaveBeenCalledWith(
        1,
        0,
        expect.objectContaining({ txHash: "hopTxSig" })
      );
      // Should NOT mark as completed — more hops remain
      expect(mockMarkAllHopsCompleted).not.toHaveBeenCalled();
      expect(mockUpdateRouteStatus).not.toHaveBeenCalled();
    });

    it("should not crash on critical errors", async () => {
      mockGetOverdueHops.mockRejectedValue(new Error("DB connection lost"));

      // Should not throw
      await expect(getTriggerFn()()).resolves.not.toThrow();
    });

    it("should skip overlapping ticks while a previous hop scan is still running", async () => {
      let releaseFirstTick: (() => void) | undefined;
      mockGetOverdueHops.mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseFirstTick = () => resolve([]);
          })
      );

      const firstTick = getTriggerFn()();
      const secondTick = getTriggerFn()();

      await Promise.resolve();

      expect(mockGetOverdueHops).toHaveBeenCalledTimes(1);

      releaseFirstTick?.();
      await firstTick;
      await secondTick;
    });
  });
});
