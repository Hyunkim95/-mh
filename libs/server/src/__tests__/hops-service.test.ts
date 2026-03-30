import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const { mockSelect, mockInsert, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

// Mock the database
vi.mock("../db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  },
  hopsSchema: {
    id: "id",
    routeId: "routeId",
    hopIndex: "hopIndex",
    recipient: "recipient",
    scheduledAt: "scheduledAt",
    executedAt: "executedAt",
    txHash: "txHash",
    error: "error",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
}));

// Mock route schema
vi.mock("../routes/schema/route.schema", () => ({
  routesSchema: {
    id: "id",
    status: "status",
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args: any[]) => ({ type: "and", args })),
  asc: vi.fn((col) => ({ type: "asc", col })),
  lte: vi.fn((col, val) => ({ type: "lte", col, val })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
}));

// Mock timezone utils
vi.mock("../utils/timezone", () => ({
  utcNow: vi.fn(() => new Date("2024-01-01T12:00:00Z")),
  toUtc: vi.fn((d: Date) => d),
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

import { hopsService } from "../hops/services/hops.service";

describe("hopsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getHopById", () => {
    it("should return a hop when found", async () => {
      const hop = { id: 1, routeId: 1, hopIndex: 0, recipient: "addr1" };
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([hop]),
        }),
      });

      const result = await hopsService.getHopById(1);
      expect(result).toEqual(hop);
    });

    it("should return null when hop not found", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await hopsService.getHopById(999);
      expect(result).toBeNull();
    });
  });

  describe("getHopsByRoute", () => {
    it("should return hops ordered by index", async () => {
      const hops = [
        { id: 1, routeId: 1, hopIndex: 0 },
        { id: 2, routeId: 1, hopIndex: 1 },
      ];
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(hops),
          }),
        }),
      });

      const result = await hopsService.getHopsByRoute(1);
      expect(result).toEqual(hops);
      expect(result).toHaveLength(2);
    });
  });

  describe("getHopByRouteAndIndex", () => {
    it("should return the hop at the specified route and index", async () => {
      const hop = { id: 1, routeId: 1, hopIndex: 2, recipient: "addr" };
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([hop]),
        }),
      });

      const result = await hopsService.getHopByRouteAndIndex(1, 2);
      expect(result).toEqual(hop);
    });

    it("should return null when no hop matches", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await hopsService.getHopByRouteAndIndex(1, 99);
      expect(result).toBeNull();
    });
  });

  describe("createHopsForRoute", () => {
    it("should create multiple hops for a route", async () => {
      const createdHops = [
        { id: 1, routeId: 5, hopIndex: 0, recipient: "addr1" },
        { id: 2, routeId: 5, hopIndex: 1, recipient: "addr2" },
      ];
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(createdHops),
        }),
      });

      const result = await hopsService.createHopsForRoute(5, [
        { hopIndex: 0, recipient: "addr1", scheduledAt: new Date() },
        { hopIndex: 1, recipient: "addr2", scheduledAt: new Date() },
      ]);
      expect(result).toEqual(createdHops);
      expect(result).toHaveLength(2);
    });
  });

  describe("markAllHopsCompleted", () => {
    it("should update all unexecuted hops for a route", async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      });

      await hopsService.markAllHopsCompleted(1);
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe("updateHopExecution", () => {
    it("should update execution data and return the hop", async () => {
      const updatedHop = { id: 1, txHash: "tx123", executedAt: new Date() };
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedHop]),
          }),
        }),
      });

      const result = await hopsService.updateHopExecution(1, {
        txHash: "tx123",
        executedAt: new Date(),
      });
      expect(result).toEqual(updatedHop);
    });

    it("should return null when hop not found", async () => {
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await hopsService.updateHopExecution(999, {
        txHash: "tx123",
      });
      expect(result).toBeNull();
    });
  });

  describe("updateHopExecutionByIndex", () => {
    it("should update hop by route and index", async () => {
      const updatedHop = { id: 1, routeId: 1, hopIndex: 0, txHash: "tx123" };
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedHop]),
          }),
        }),
      });

      const result = await hopsService.updateHopExecutionByIndex(1, 0, {
        txHash: "tx123",
      });
      expect(result).toEqual(updatedHop);
    });
  });

  describe("updateHopSchedule", () => {
    it("should update scheduledAt for a hop", async () => {
      const updatedHop = {
        id: 1,
        scheduledAt: new Date("2024-06-01T00:00:00Z"),
      };
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedHop]),
          }),
        }),
      });

      const result = await hopsService.updateHopSchedule(
        1,
        new Date("2024-06-01T00:00:00Z")
      );
      expect(result).toEqual(updatedHop);
    });
  });

  describe("updateHopScheduleByIndex", () => {
    it("should update scheduledAt by route and index", async () => {
      const updatedHop = {
        id: 1,
        routeId: 1,
        hopIndex: 0,
        scheduledAt: new Date("2024-06-01T00:00:00Z"),
      };
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedHop]),
          }),
        }),
      });

      const result = await hopsService.updateHopScheduleByIndex(
        1,
        0,
        new Date("2024-06-01T00:00:00Z")
      );
      expect(result).toEqual(updatedHop);
    });
  });

  describe("deleteHopsForRoute", () => {
    it("should delete all hops for a route and return count", async () => {
      mockDelete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 3 }),
      });

      const result = await hopsService.deleteHopsForRoute(1);
      expect(result).toBe(3);
    });

    it("should return 0 when rowCount is null", async () => {
      mockDelete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: null }),
      });

      const result = await hopsService.deleteHopsForRoute(1);
      expect(result).toBe(0);
    });
  });

  describe("getPendingHops", () => {
    it("should return hops that have not been executed", async () => {
      const pendingHops = [
        { id: 1, routeId: 1, executedAt: null },
        { id: 2, routeId: 1, executedAt: null },
      ];
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(pendingHops),
          }),
        }),
      });

      const result = await hopsService.getPendingHops(1);
      expect(result).toEqual(pendingHops);
    });

    it("should work without routeId filter", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await hopsService.getPendingHops();
      expect(result).toEqual([]);
    });
  });

  describe("getExecutedHops", () => {
    it("should return executed hops", async () => {
      const executedHops = [
        { id: 1, executedAt: new Date("2024-01-01") },
      ];
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(executedHops),
          }),
        }),
      });

      const result = await hopsService.getExecutedHops(1);
      expect(result).toEqual(executedHops);
    });
  });

  describe("getOverdueHops", () => {
    it("should return overdue hops with inner join", async () => {
      const overdueHops = [
        { id: 1, routeId: 1, txHash: null },
      ];
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(overdueHops),
            }),
          }),
        }),
      });

      const result = await hopsService.getOverdueHops(new Date(), 1);
      expect(result).toEqual(overdueHops);
    });

    it("should work without currentTime and routeId", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await hopsService.getOverdueHops();
      expect(result).toEqual([]);
    });
  });

  describe("getHopsInTimeRange", () => {
    it("should return hops within time range", async () => {
      const hops = [
        { id: 1, scheduledAt: new Date("2024-01-01T10:00:00Z") },
        { id: 2, scheduledAt: new Date("2024-01-01T11:00:00Z") },
      ];
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(hops),
          }),
        }),
      });

      const result = await hopsService.getHopsInTimeRange(
        new Date("2024-01-01T09:00:00Z"),
        new Date("2024-01-01T12:00:00Z"),
        1
      );
      expect(result).toEqual(hops);
    });

    it("should work without routeId filter", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await hopsService.getHopsInTimeRange(
        new Date("2024-01-01T09:00:00Z"),
        new Date("2024-01-01T12:00:00Z")
      );
      expect(result).toEqual([]);
    });
  });

  describe("shiftHopSchedulesAfterDeployment", () => {
    it("should shift unexecuted hop schedules forward", async () => {
      const hops = [
        { id: 1, hopIndex: 0, executedAt: null, txHash: null, scheduledAt: new Date("2024-01-01T10:00:00Z") },
        { id: 2, hopIndex: 1, executedAt: null, txHash: null, scheduledAt: new Date("2024-01-01T11:00:00Z") },
      ];
      // getHopsByRoute
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(hops),
          }),
        }),
      });

      // updateHopScheduleByIndex
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{}]),
          }),
        }),
      });

      const result = await hopsService.shiftHopSchedulesAfterDeployment(1);
      expect(result).toBe(2);
    });

    it("should return 0 when no hops exist", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await hopsService.shiftHopSchedulesAfterDeployment(1);
      expect(result).toBe(0);
    });

    it("should return 0 when all hops are already executed", async () => {
      const hops = [
        { id: 1, hopIndex: 0, executedAt: new Date(), txHash: "tx1", scheduledAt: new Date() },
      ];
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(hops),
          }),
        }),
      });

      const result = await hopsService.shiftHopSchedulesAfterDeployment(1);
      expect(result).toBe(0);
    });

    it("should return 0 when offset is zero or negative", async () => {
      // First unexecuted hop is in the future (after utcNow mock = 2024-01-01T12:00:00Z)
      const hops = [
        { id: 1, hopIndex: 0, executedAt: null, txHash: null, scheduledAt: new Date("2024-01-01T14:00:00Z") },
      ];
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(hops),
          }),
        }),
      });

      const result = await hopsService.shiftHopSchedulesAfterDeployment(1);
      expect(result).toBe(0);
    });
  });
});
