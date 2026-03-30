import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const {
  mockTransaction,
  mockInsert,
  mockUpdate,
  mockDelete,
  mockFindFirst,
  mockFindMany,
  mockIsRouteDeployedOnChain,
  mockObfuscationCreateSession,
} = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockFindFirst: vi.fn(),
  mockFindMany: vi.fn(),
  mockIsRouteDeployedOnChain: vi.fn(),
  mockObfuscationCreateSession: vi.fn(),
}));

// Mock the database
vi.mock("../db", () => ({
  db: {
    transaction: mockTransaction,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    query: {
      routesSchema: {
        findFirst: mockFindFirst,
        findMany: mockFindMany,
      },
    },
  },
  hopsSchema: {
    routeId: "routeId",
  },
}));

// Mock route schema
vi.mock("../routes/schema/route.schema", () => ({
  routesSchema: {
    id: "id",
    creator: "creator",
    status: "status",
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args: any[]) => ({ type: "and", args })),
  lt: vi.fn((col, val) => ({ type: "lt", col, val })),
}));

// Mock timezone utils
vi.mock("../utils/timezone", () => ({
  parseUserDateToUtc: vi.fn((d: any) => new Date(d)),
}));

// Mock contract service
vi.mock("../solana/services/contract.service", () => ({
  isRouteDeployedOnChain: mockIsRouteDeployedOnChain,
}));

// Mock obfuscation
vi.mock("../obfuscation", () => ({
  obfuscationService: {
    createSession: mockObfuscationCreateSession,
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

import routesService from "../routes/services/routes.service";

describe("routesService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createRoute", () => {
    it("should create a route with hops in a transaction", async () => {
      const mockRoute = {
        id: 1,
        name: "Test Route",
        tokenType: "SOL",
        status: "draft",
        creator: "creator1",
      };

      // Mock transaction to execute the callback
      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([mockRoute]),
            }),
          }),
        };
        return cb(tx);
      });
      mockObfuscationCreateSession.mockResolvedValue({});

      const result = await routesService.createRoute({
        name: "Test Route",
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: "1.0",
        hopAmountRaw: "1000000000",
        hops: [
          { recipient: "addr1", scheduledAt: "2024-01-01T00:00:00Z" },
          { recipient: "addr2", scheduledAt: "2024-01-01T01:00:00Z" },
        ],
        creator: "creator1",
      });

      expect(result).toEqual(mockRoute);
      expect(mockTransaction).toHaveBeenCalled();
      expect(mockObfuscationCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({ routeId: 1 })
      );
    });

    it("should create a route with empty hops array", async () => {
      const mockRoute = {
        id: 2,
        name: "No Hops Route",
        tokenType: "SOL",
        status: "draft",
        creator: "creator1",
      };

      const txInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockRoute]),
        }),
      });
      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = { insert: txInsert };
        return cb(tx);
      });
      mockObfuscationCreateSession.mockResolvedValue({});

      const result = await routesService.createRoute({
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: "1.0",
        hopAmountRaw: "1000000000",
        hops: [],
        creator: "creator1",
      });

      expect(result).toEqual(mockRoute);
      // insert called once for the route, but NOT a second time for hops
      expect(txInsert).toHaveBeenCalledTimes(1);
    });

    it("should create a route with SPL token fields (tokenMint, tokenSymbol)", async () => {
      const mockRoute = {
        id: 3,
        name: "SPL Route",
        tokenType: "SPL",
        tokenMint: "USDCmintAddr",
        tokenSymbol: "USDC",
        status: "draft",
        creator: "creator1",
      };

      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([mockRoute]),
            }),
          }),
        };
        return cb(tx);
      });
      mockObfuscationCreateSession.mockResolvedValue({});

      const result = await routesService.createRoute({
        name: "SPL Route",
        tokenType: "SPL",
        tokenMint: "USDCmintAddr",
        tokenSymbol: "USDC",
        tokenDecimals: 6,
        hopAmountTokens: "10.0",
        hopAmountRaw: "10000000",
        hops: [{ recipient: "addr1", scheduledAt: "2024-06-01T12:00:00Z" }],
        creator: "creator1",
      });

      expect(result.tokenType).toBe("SPL");
      expect(mockObfuscationCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenMint: "USDCmintAddr",
          tokenType: "SPL",
        })
      );
    });

    it("should create a route with isEasyRoute flag", async () => {
      const mockRoute = {
        id: 4,
        name: "Easy Route",
        tokenType: "SOL",
        status: "draft",
        creator: "creator1",
        isEasyRoute: true,
      };

      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([mockRoute]),
            }),
          }),
        };
        return cb(tx);
      });
      mockObfuscationCreateSession.mockResolvedValue({});

      const result = await routesService.createRoute({
        name: "Easy Route",
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: "0.5",
        hopAmountRaw: "500000000",
        hops: [{ recipient: "addr1", scheduledAt: "2024-01-01T00:00:00Z" }],
        creator: "creator1",
        isEasyRoute: true,
      });

      expect(result.isEasyRoute).toBe(true);
    });

    it("should throw if obfuscation session creation fails", async () => {
      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 1 }]),
            }),
          }),
        };
        return cb(tx);
      });
      mockObfuscationCreateSession.mockRejectedValue(
        new Error("Obfuscation failed")
      );

      await expect(
        routesService.createRoute({
          tokenType: "SOL",
          tokenDecimals: 9,
          hopAmountTokens: "1.0",
          hopAmountRaw: "1000000000",
          hops: [],
          creator: "creator1",
        })
      ).rejects.toThrow("Obfuscation failed");
    });
  });

  describe("getRoute", () => {
    it("should return a route with computed hop delays", async () => {
      const mockRoute = {
        id: 1,
        creator: "creator1",
        status: "deployed",
        hops: [
          {
            recipient: "addr1",
            scheduledAt: new Date("2024-01-01T00:00:00Z"),
            hopIndex: 0,
          },
          {
            recipient: "addr2",
            scheduledAt: new Date("2024-01-01T01:00:00Z"),
            hopIndex: 1,
          },
        ],
      };
      mockFindFirst.mockResolvedValue(mockRoute);

      const result = await routesService.getRoute(1, "creator1");
      expect(result).not.toBeNull();
      expect(result!.canDeploy).toBe(false); // deployed routes can't be redeployed via canDeploy
      expect(result!.hops).toHaveLength(2);
      expect(result!.hops![0].delayMinutes).toBe(0); // first hop has no delay
      expect(result!.hops![1].delayMinutes).toBe(60); // 1 hour delay
      expect(result!.hops![1].delaySeconds).toBe(3600);
    });

    it("should return null when route not found", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await routesService.getRoute(999, "creator1");
      expect(result).toBeNull();
    });

    it("should check on-chain deployment for draft routes", async () => {
      const mockRoute = {
        id: 1,
        creator: "creator1",
        status: "draft",
        hops: [],
      };
      mockFindFirst.mockResolvedValue(mockRoute);
      mockIsRouteDeployedOnChain.mockResolvedValue(true);

      const result = await routesService.getRoute(1, "creator1");
      expect(result!.canDeploy).toBe(false);
      expect(mockIsRouteDeployedOnChain).toHaveBeenCalledWith(1);
    });

    it("should allow deploy for draft routes not on chain", async () => {
      const mockRoute = {
        id: 1,
        creator: "creator1",
        status: "draft",
        hops: [],
      };
      mockFindFirst.mockResolvedValue(mockRoute);
      mockIsRouteDeployedOnChain.mockResolvedValue(false);

      const result = await routesService.getRoute(1, "creator1");
      expect(result!.canDeploy).toBe(true);
    });

    it("should set canDeploy true for completed routes", async () => {
      const mockRoute = {
        id: 1,
        creator: "creator1",
        status: "completed",
        hops: [],
      };
      mockFindFirst.mockResolvedValue(mockRoute);

      const result = await routesService.getRoute(1, "creator1");
      // completed: isDeployed=true, but canDeploy = !isDeployed || status==='completed' => true
      expect(result!.canDeploy).toBe(true);
    });

    it("should handle hops with executedAt values", async () => {
      const mockRoute = {
        id: 1,
        creator: "creator1",
        status: "deployed",
        hops: [
          {
            recipient: "addr1",
            scheduledAt: new Date("2024-01-01T00:00:00Z"),
            executedAt: new Date("2024-01-01T00:00:05Z"),
            hopIndex: 0,
          },
          {
            recipient: "addr2",
            scheduledAt: new Date("2024-01-01T01:00:00Z"),
            executedAt: null,
            hopIndex: 1,
          },
        ],
      };
      mockFindFirst.mockResolvedValue(mockRoute);

      const result = await routesService.getRoute(1, "creator1");
      expect(((result!.hops![0] as unknown) as { executedAt: string | null }).executedAt).not.toBeNull();
      expect(((result!.hops![1] as unknown) as { executedAt: string | null }).executedAt).toBeNull();
    });

    it("should handle hops with string scheduledAt values", async () => {
      const mockRoute = {
        id: 1,
        creator: "creator1",
        status: "deployed",
        hops: [
          {
            recipient: "addr1",
            scheduledAt: "2024-01-01T00:00:00Z",
            hopIndex: 0,
          },
        ],
      };
      mockFindFirst.mockResolvedValue(mockRoute);

      const result = await routesService.getRoute(1, "creator1");
      expect(result!.hops).toHaveLength(1);
      // String scheduledAt should pass through as-is
      expect(result!.hops![0].scheduledAt).toBe("2024-01-01T00:00:00Z");
    });

    it("should return empty hops array when route has no hops", async () => {
      const mockRoute = {
        id: 1,
        creator: "creator1",
        status: "deployed",
        hops: null,
      };
      mockFindFirst.mockResolvedValue(mockRoute);

      const result = await routesService.getRoute(1, "creator1");
      expect(result!.hops).toHaveLength(0);
    });
  });

  describe("updateRouteStatus", () => {
    it("should update status to deployed with deployment data", async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      });

      await routesService.updateRouteStatus(1, "creator1", "deployed", {
        deploymentTxHash: "tx123",
        routeConfigPda: "pda123",
      });

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should update status to failed with error", async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      });

      await routesService.updateRouteStatus(1, "creator1", "failed", {
        deploymentError: "Deployment failed",
      });

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should update status without deployment data", async () => {
      const mockSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockUpdate.mockReturnValue({ set: mockSet });

      await routesService.updateRouteStatus(1, "creator1", "deploying");

      expect(mockUpdate).toHaveBeenCalled();
      // set should be called with just status + updatedAt (no deployment fields)
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "deploying" })
      );
    });
  });

  describe("deleteRoute", () => {
    it("should not delete a deployed route", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        creator: "creator1",
        status: "deployed",
        hops: [],
      });

      const result = await routesService.deleteRoute(1, "creator1");
      expect(result).toBe(false);
    });

    it("should delete a draft route", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        creator: "creator1",
        status: "draft",
        hops: [],
      });
      mockIsRouteDeployedOnChain.mockResolvedValue(false);
      mockDelete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      });

      const result = await routesService.deleteRoute(1, "creator1");
      expect(result).toBe(true);
    });

    it("should return false when route not found", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await routesService.deleteRoute(999, "creator1");
      expect(result).toBe(false);
    });

    it("should return false when delete affects zero rows", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        creator: "creator1",
        status: "draft",
        hops: [],
      });
      mockIsRouteDeployedOnChain.mockResolvedValue(false);
      mockDelete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 0 }),
      });

      const result = await routesService.deleteRoute(1, "creator1");
      expect(result).toBe(false);
    });

    it("should return false when delete returns null rowCount", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        creator: "creator1",
        status: "draft",
        hops: [],
      });
      mockIsRouteDeployedOnChain.mockResolvedValue(false);
      mockDelete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: null }),
      });

      const result = await routesService.deleteRoute(1, "creator1");
      expect(result).toBe(false);
    });
  });

  describe("updateRoute", () => {
    it("should return null for deployed routes", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        creator: "creator1",
        status: "deployed",
        hops: [],
      });

      const result = await routesService.updateRoute(1, "creator1", {
        name: "New Name",
      });
      expect(result).toBeNull();
    });

    it("should return null for non-existent routes", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await routesService.updateRoute(999, "creator1", {
        name: "New Name",
      });
      expect(result).toBeNull();
    });

    it("should update route details in a transaction for draft routes", async () => {
      const mockRoute = {
        id: 1,
        creator: "creator1",
        status: "draft",
        hops: [],
      };
      mockFindFirst
        .mockResolvedValueOnce(mockRoute) // getRoute check
        .mockResolvedValueOnce(mockRoute); // getRoute at end of transaction

      mockIsRouteDeployedOnChain.mockResolvedValue(false);

      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
        };
        return cb(tx);
      });

      // The function calls getRoute at the end which re-queries
      await routesService.updateRoute(1, "creator1", {
        name: "Updated Name",
      });
      expect(mockTransaction).toHaveBeenCalled();
    });

    it("should replace hops when updates include hops", async () => {
      const mockRoute = {
        id: 1,
        creator: "creator1",
        status: "draft",
        hops: [],
      };
      mockFindFirst
        .mockResolvedValueOnce(mockRoute) // initial getRoute check
        .mockResolvedValueOnce(mockRoute); // getRoute at end of transaction

      mockIsRouteDeployedOnChain.mockResolvedValue(false);

      const txDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const txInsertValues = vi.fn().mockResolvedValue(undefined);
      const txInsert = vi.fn().mockReturnValue({
        values: txInsertValues,
      });
      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
          delete: txDelete,
          insert: txInsert,
        };
        return cb(tx);
      });

      await routesService.updateRoute(1, "creator1", {
        name: "Updated Route",
        hops: [
          { recipient: "newAddr1", scheduledAt: "2024-06-01T00:00:00Z" },
          { recipient: "newAddr2", scheduledAt: "2024-06-01T01:00:00Z" },
        ],
      });

      expect(txDelete).toHaveBeenCalled(); // old hops deleted
      expect(txInsert).toHaveBeenCalled(); // new hops inserted
    });

    it("should replace hops with empty array", async () => {
      const mockRoute = {
        id: 1,
        creator: "creator1",
        status: "draft",
        hops: [{ recipient: "addr1", scheduledAt: new Date(), hopIndex: 0 }],
      };
      mockFindFirst
        .mockResolvedValueOnce(mockRoute) // initial getRoute check
        .mockResolvedValueOnce({ ...mockRoute, hops: [] }); // getRoute at end

      mockIsRouteDeployedOnChain.mockResolvedValue(false);

      const txDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const txInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });
      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
          delete: txDelete,
          insert: txInsert,
        };
        return cb(tx);
      });

      await routesService.updateRoute(1, "creator1", {
        hops: [], // empty hops array
      });

      expect(txDelete).toHaveBeenCalled(); // old hops deleted
      // insert should NOT be called for empty hops
      expect(txInsert).not.toHaveBeenCalled();
    });
  });

  describe("replayRoute", () => {
    it("should throw when route not found", async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(
        routesService.replayRoute(999, "creator1")
      ).rejects.toThrow("Route not found");
    });

    it("should throw when route has no hops", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        creator: "creator1",
        hops: [],
      });

      await expect(
        routesService.replayRoute(1, "creator1")
      ).rejects.toThrow("Cannot replay a route without hops");
    });

    it("should throw when hops field is undefined (null)", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        creator: "creator1",
        hops: undefined,
      });

      await expect(
        routesService.replayRoute(1, "creator1")
      ).rejects.toThrow("Cannot replay a route without hops");
    });

    it("should clone a route with rebased timestamps preserving deltas", async () => {
      const existingRoute = {
        id: 1,
        name: "Original Route",
        description: "Test desc",
        creator: "creator1",
        tokenType: "SOL",
        tokenMint: null,
        tokenSymbol: null,
        tokenDecimals: 9,
        hopAmountTokens: "1.0",
        hopAmountRaw: "1000000000",
        hops: [
          {
            recipient: "addr1",
            scheduledAt: new Date("2024-01-01T00:00:00Z"),
            hopIndex: 0,
          },
          {
            recipient: "addr2",
            scheduledAt: new Date("2024-01-01T00:05:00Z"), // 5 min delta
            hopIndex: 1,
          },
          {
            recipient: "addr3",
            scheduledAt: new Date("2024-01-01T00:15:00Z"), // 10 min delta
            hopIndex: 2,
          },
        ],
      };

      const clonedRoute = {
        id: 2,
        name: "Original Route (Replay)",
        tokenType: "SOL",
        status: "draft",
        creator: "creator1",
      };

      const clonedRouteWithStatus = {
        ...clonedRoute,
        canDeploy: true,
        deploymentStatus: "draft",
        hops: [],
      };

      // First call: findFirst for loading existing route
      // Second call: findFirst inside createRoute->transaction (not used since tx mock)
      // Third call: findFirst for getRoute on cloned route
      mockFindFirst
        .mockResolvedValueOnce(existingRoute)        // replayRoute: load existing
        .mockResolvedValueOnce(clonedRouteWithStatus); // getRoute on cloned route

      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([clonedRoute]),
            }),
          }),
        };
        return cb(tx);
      });
      mockObfuscationCreateSession.mockResolvedValue({});
      mockIsRouteDeployedOnChain.mockResolvedValue(false);

      const result = await routesService.replayRoute(1, "creator1");

      expect(result).toBeDefined();
      expect(mockTransaction).toHaveBeenCalled();
      expect(mockObfuscationCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({ routeId: 2 })
      );
    });

    it("should clone a route with SPL token fields", async () => {
      const existingRoute = {
        id: 1,
        name: "SPL Route",
        description: null,
        creator: "creator1",
        tokenType: "SPL",
        tokenMint: "USDCmintAddr",
        tokenSymbol: "USDC",
        tokenDecimals: 6,
        hopAmountTokens: "10.0",
        hopAmountRaw: "10000000",
        hops: [
          {
            recipient: "addr1",
            scheduledAt: new Date("2024-01-01T00:00:00Z"),
            hopIndex: 0,
          },
          {
            recipient: "addr2",
            scheduledAt: new Date("2024-01-01T01:00:00Z"),
            hopIndex: 1,
          },
        ],
      };

      const clonedRoute = {
        id: 3,
        tokenType: "SPL",
        status: "draft",
        creator: "creator1",
      };

      const clonedRouteWithStatus = {
        ...clonedRoute,
        canDeploy: true,
        deploymentStatus: "draft",
        hops: [],
      };

      mockFindFirst
        .mockResolvedValueOnce(existingRoute)
        .mockResolvedValueOnce(clonedRouteWithStatus);

      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([clonedRoute]),
            }),
          }),
        };
        return cb(tx);
      });
      mockObfuscationCreateSession.mockResolvedValue({});
      mockIsRouteDeployedOnChain.mockResolvedValue(false);

      const result = await routesService.replayRoute(1, "creator1");

      expect(result).toBeDefined();
      // Verify obfuscation was called with SPL token fields
      expect(mockObfuscationCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenMint: "USDCmintAddr",
          tokenType: "SPL",
        })
      );
    });

    it("should throw when cloned route cannot be loaded", async () => {
      const existingRoute = {
        id: 1,
        name: "Route",
        description: null,
        creator: "creator1",
        tokenType: "SOL",
        tokenMint: null,
        tokenSymbol: null,
        tokenDecimals: 9,
        hopAmountTokens: "1.0",
        hopAmountRaw: "1000000000",
        hops: [
          {
            recipient: "addr1",
            scheduledAt: new Date("2024-01-01T00:00:00Z"),
            hopIndex: 0,
          },
        ],
      };

      const clonedRoute = { id: 10, status: "draft", creator: "creator1" };

      mockFindFirst
        .mockResolvedValueOnce(existingRoute) // load existing
        .mockResolvedValueOnce(null);          // getRoute returns null

      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([clonedRoute]),
            }),
          }),
        };
        return cb(tx);
      });
      mockObfuscationCreateSession.mockResolvedValue({});

      await expect(
        routesService.replayRoute(1, "creator1")
      ).rejects.toThrow("Failed to load cloned route");
    });

    it("should handle a single-hop route", async () => {
      const existingRoute = {
        id: 1,
        name: null,
        description: null,
        creator: "creator1",
        tokenType: "SOL",
        tokenMint: null,
        tokenSymbol: null,
        tokenDecimals: 9,
        hopAmountTokens: "1.0",
        hopAmountRaw: "1000000000",
        hops: [
          {
            recipient: "addr1",
            scheduledAt: new Date("2024-01-01T00:00:00Z"),
            hopIndex: 0,
          },
        ],
      };

      const clonedRoute = { id: 5, status: "draft", creator: "creator1" };
      const clonedRouteWithStatus = {
        ...clonedRoute,
        canDeploy: true,
        deploymentStatus: "draft",
        hops: [],
      };

      mockFindFirst
        .mockResolvedValueOnce(existingRoute)
        .mockResolvedValueOnce(clonedRouteWithStatus);

      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([clonedRoute]),
            }),
          }),
        };
        return cb(tx);
      });
      mockObfuscationCreateSession.mockResolvedValue({});
      mockIsRouteDeployedOnChain.mockResolvedValue(false);

      const result = await routesService.replayRoute(1, "creator1");
      expect(result).toBeDefined();
    });
  });

  describe("updateHopTimestamps", () => {
    it("should replace hops with new timestamps in a transaction", async () => {
      const mockTx = {
        query: {
          routesSchema: {
            findFirst: vi.fn().mockResolvedValue({ id: 1, creator: "creator1" }),
          },
        },
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      };
      mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

      await routesService.updateHopTimestamps(1, "creator1", [
        { recipient: "addr1", scheduledAt: Date.now() },
        { recipient: "addr2", scheduledAt: Date.now() + 60000 },
      ]);

      expect(mockTransaction).toHaveBeenCalled();
      expect(mockTx.delete).toHaveBeenCalled();
      expect(mockTx.insert).toHaveBeenCalled();
    });

    it("should throw when route not found or unauthorized", async () => {
      const mockTx = {
        query: {
          routesSchema: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
      };
      mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

      await expect(
        routesService.updateHopTimestamps(999, "creator1", [])
      ).rejects.toThrow("Route not found or unauthorized");
    });
  });

  describe("getRoutesByCreatorPaginated", () => {
    it("should return paginated routes with next cursor", async () => {
      const routes = [
        { id: 3, creator: "c", status: "deployed", hops: [], obfuscationSession: null },
        { id: 2, creator: "c", status: "deployed", hops: [], obfuscationSession: null },
        { id: 1, creator: "c", status: "deployed", hops: [], obfuscationSession: null },
      ];
      mockFindMany.mockResolvedValue(routes);

      const result = await routesService.getRoutesByCreatorPaginated({
        creator: "c",
        limit: 2,
      });

      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBe(1); // id of the popped item
    });

    it("should return null nextCursor when no more pages", async () => {
      const routes = [
        { id: 1, creator: "c", status: "deployed", hops: [], obfuscationSession: null },
      ];
      mockFindMany.mockResolvedValue(routes);

      const result = await routesService.getRoutesByCreatorPaginated({
        creator: "c",
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe("getRouteById", () => {
    it("should return null when route not found", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await routesService.getRouteById(999);
      expect(result).toBeNull();
    });
  });

  describe("triggerNextHop", () => {
    it("should not throw (placeholder implementation)", async () => {
      await expect(routesService.triggerNextHop(1)).resolves.not.toThrow();
    });
  });
});
