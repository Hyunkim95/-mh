import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  createRoute: vi.fn(),
  replayRoute: vi.fn(),
  getRoutesByCreatorPaginated: vi.fn(),
  getRoute: vi.fn(),
  updateRoute: vi.fn(),
  deleteRoute: vi.fn(),
  updateHopTimestamps: vi.fn(),
  updateRouteStatus: vi.fn(),
  validateRoute: vi.fn(),
  getSessionByRouteId: vi.fn(),
  getSessionWithWallets: vi.fn(),
  estimateObfuscationFees: vi.fn(),
  getIntermediateWallets: vi.fn(),
  updateSessionStatus: vi.fn(),
  scheduleAggregations: vi.fn(),
  buildAllFundingTransactions: vi.fn(),
  updateFundingStatusByIndex: vi.fn(),
  areAllWalletsFunded: vi.fn(),
  dbQueryRoutes: vi.fn(),
}));

vi.mock("../routes/services/routes.service", () => ({
  default: {
    createRoute: mocks.createRoute,
    replayRoute: mocks.replayRoute,
    getRoutesByCreatorPaginated: mocks.getRoutesByCreatorPaginated,
    getRoute: mocks.getRoute,
    updateRoute: mocks.updateRoute,
    deleteRoute: mocks.deleteRoute,
    updateHopTimestamps: mocks.updateHopTimestamps,
    updateRouteStatus: mocks.updateRouteStatus,
  },
}));

vi.mock("../routes/services/route-validation.service", () => ({
  validateRoute: mocks.validateRoute,
}));

vi.mock("../obfuscation", () => ({
  obfuscationService: {
    getSessionByRouteId: mocks.getSessionByRouteId,
    getSessionWithWallets: mocks.getSessionWithWallets,
    estimateObfuscationFees: mocks.estimateObfuscationFees,
    getIntermediateWallets: mocks.getIntermediateWallets,
    updateSessionStatus: mocks.updateSessionStatus,
    scheduleAggregations: mocks.scheduleAggregations,
  },
  intermediateWalletService: {
    updateFundingStatusByIndex: mocks.updateFundingStatusByIndex,
    areAllWalletsFunded: mocks.areAllWalletsFunded,
  },
  obfuscationTxBuilder: {
    buildAllFundingTransactions: mocks.buildAllFundingTransactions,
  },
}));

vi.mock("../db", () => ({
  db: {
    query: {
      routesSchema: {
        findFirst: mocks.dbQueryRoutes,
      },
    },
  },
  routesSchema: { id: "id" },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  };
});

vi.mock("@libs/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { routesRouter } from "../routers/routes.router";

const authCtx = {
  user: {
    publicKey: "11111111111111111111111111111111",
  },
};

const caller = routesRouter.createCaller(authCtx as any);
const unauthenticatedCaller = routesRouter.createCaller({ user: null } as any);

const CREATOR = "11111111111111111111111111111111";
const RECIPIENT = "22222222222222222222222222222222";

const routeInput = {
  name: "Test Route",
  tokenType: "SOL" as const,
  tokenDecimals: 9,
  hopAmountTokens: "1.0",
  hopAmountRaw: "1000000000",
  hops: [{ recipient: RECIPIENT, scheduledAt: "2025-06-15T12:00:00Z" }],
};

describe("routesRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validate", () => {
    it("requires authentication", async () => {
      await expect(unauthenticatedCaller.validate(routeInput)).rejects.toThrow(
        "UNAUTHORIZED"
      );
    });

    it("returns validation result on success", async () => {
      mocks.validateRoute.mockResolvedValue({
        isValid: true,
        errors: [],
      });

      const result = await caller.validate(routeInput);

      expect(result.success).toBe(true);
      expect(result.data.isValid).toBe(true);
    });

    it("returns errors when validation fails", async () => {
      mocks.validateRoute.mockResolvedValue({
        isValid: false,
        errors: ["Too many hops"],
      });

      const result = await caller.validate(routeInput);

      expect(result.data.isValid).toBe(false);
      expect(result.data.errors).toContain("Too many hops");
    });

    it("returns error result when service throws", async () => {
      mocks.validateRoute.mockRejectedValue(new Error("service down"));

      const result = await caller.validate(routeInput);

      expect(result.success).toBe(false);
    });
  });

  describe("create", () => {
    it("creates route on valid input", async () => {
      mocks.validateRoute.mockResolvedValue({ isValid: true, errors: [] });
      mocks.createRoute.mockResolvedValue({ id: 1, name: "Test Route" });

      const result = await caller.create(routeInput);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(1);
    });

    it("throws when validation fails", async () => {
      mocks.validateRoute.mockResolvedValue({
        isValid: false,
        errors: ["Too many hops"],
      });

      await expect(caller.create(routeInput)).rejects.toThrow(
        "Route validation failed"
      );
    });
  });

  describe("replay", () => {
    it("clones a route", async () => {
      mocks.replayRoute.mockResolvedValue({ id: 2, name: "Cloned Route" });

      const result = await caller.replay({ id: 1 });

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(2);
    });
  });

  describe("getByCreator", () => {
    it("returns paginated routes", async () => {
      mocks.getRoutesByCreatorPaginated.mockResolvedValue({
        data: [{ id: 1 }],
        nextCursor: 2,
      });

      const result = await caller.getByCreator({
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.nextCursor).toBe(2);
    });
  });

  describe("getById", () => {
    it("returns route when found", async () => {
      mocks.getRoute.mockResolvedValue({ id: 1, name: "My Route" });

      const result = await caller.getById({ id: 1 });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe("My Route");
    });

    it("throws when not found", async () => {
      mocks.getRoute.mockResolvedValue(null);

      await expect(
        caller.getById({ id: 999 })
      ).rejects.toThrow();
    });
  });

  describe("update", () => {
    it("updates route without validation when no hops changed", async () => {
      mocks.updateRoute.mockResolvedValue({ id: 1, name: "Updated" });

      const result = await caller.update({
        id: 1,
        updates: { name: "Updated" },
      });

      expect(result.success).toBe(true);
      expect(mocks.validateRoute).not.toHaveBeenCalled();
    });

    it("validates when hops are updated", async () => {
      mocks.getRoute.mockResolvedValue({
        id: 1,
        tokenType: "SOL",
        hopAmountRaw: "1000",
        hops: [],
      });
      mocks.validateRoute.mockResolvedValue({ isValid: true, errors: [] });
      mocks.updateRoute.mockResolvedValue({ id: 1 });

      const result = await caller.update({
        id: 1,
        updates: { hops: [{ recipient: RECIPIENT, scheduledAt: "2025-06-15T12:00:00Z" }] },
      });

      expect(result.success).toBe(true);
      expect(mocks.validateRoute).toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("deletes a route", async () => {
      mocks.deleteRoute.mockResolvedValue(true);

      const result = await caller.delete({ id: 1 });

      expect(result.success).toBe(true);
    });

    it("throws when route not found", async () => {
      mocks.deleteRoute.mockResolvedValue(false);

      await expect(
        caller.delete({ id: 999 })
      ).rejects.toThrow();
    });
  });

  describe("updateHopTimestamps", () => {
    it("updates timestamps successfully", async () => {
      mocks.updateHopTimestamps.mockResolvedValue(undefined);

      const result = await caller.updateHopTimestamps({
        routeId: 1,
        hops: [{ recipient: RECIPIENT, scheduledAt: Date.now() }],
      });

      expect(result.success).toBe(true);
    });
  });

  describe("markDeployed", () => {
    it("marks route as deployed", async () => {
      mocks.updateRouteStatus.mockResolvedValue(undefined);
      mocks.getRoute.mockResolvedValue({ id: 1, status: "deployed" });

      const result = await caller.markDeployed({
        id: 1,
        deploymentTxHash: "tx-hash-123",
      });

      expect(result.success).toBe(true);
      expect(mocks.updateRouteStatus).toHaveBeenCalledWith(
        1,
        CREATOR,
        "deployed",
        expect.objectContaining({ deploymentTxHash: "tx-hash-123" })
      );
    });
  });

  describe("getObfuscationSession", () => {
    it("returns session when found", async () => {
      mocks.getSessionByRouteId.mockResolvedValue({ id: 1 });
      mocks.getSessionWithWallets.mockResolvedValue({
        id: 1,
        wallets: [],
      });

      const result = await caller.getObfuscationSession({ routeId: 1 });

      expect(result.success).toBe(true);
    });

    it("returns null when no session", async () => {
      mocks.getSessionByRouteId.mockResolvedValue(null);

      const result = await caller.getObfuscationSession({ routeId: 1 });

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
    });
  });

  describe("getObfuscationCostEstimate", () => {
    it("returns cost estimate", async () => {
      mocks.getSessionByRouteId.mockResolvedValue({
        id: 1,
        intermediateCount: 3,
        tokenType: "SOL",
      });
      mocks.dbQueryRoutes.mockResolvedValue({
        id: 1,
        hopAmountRaw: "1000000",
        hops: [{ id: 1 }, { id: 2 }],
      });
      mocks.estimateObfuscationFees.mockResolvedValue({
        totalFeesLamports: 50000,
        fundingTxFees: 10000,
        aggregationTxFees: 10000,
        cleanupTxFees: 5000,
        intermediateAtaCreation: 15000,
        walletXAtaCreation: 5000,
        rentRecovery: 3000,
        dustRefund: 2000,
      });

      const result = await caller.getObfuscationCostEstimate({ routeId: 1 });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("breakdown");
    });

    it("returns null when no session", async () => {
      mocks.getSessionByRouteId.mockResolvedValue(null);

      const result = await caller.getObfuscationCostEstimate({ routeId: 1 });

      expect(result.success).toBe(false);
    });

    it("keeps large SPL routes on the sane overhead path", async () => {
      mocks.getSessionByRouteId.mockResolvedValue({
        id: 77,
        intermediateCount: 5,
        tokenType: "SPL",
      });
      mocks.dbQueryRoutes.mockResolvedValue({
        id: 77,
        hopAmountRaw: "100000000000",
        hops: [{ id: 1 }, { id: 2 }, { id: 3 }],
      });
      mocks.estimateObfuscationFees.mockResolvedValue({
        totalFeesLamports: 136875000,
        fundingTxFees: 10000,
        aggregationTxFees: 10000,
        cleanupTxFees: 5000,
        intermediateAtaCreation: 15000,
        walletXAtaCreation: 5000,
        rentRecovery: 3000,
        dustRefund: 2000,
        deploymentCost: 136_845_000,
      });

      const result = await caller.getObfuscationCostEstimate({ routeId: 77 });

      expect(result.success).toBe(true);
      expect(result.data).not.toBeNull();
      expect(mocks.estimateObfuscationFees).toHaveBeenCalledWith(
        5,
        "SPL",
        3,
        100000000000,
      );
      expect(result.data!.totalFeesLamports).toBe(136875000);
    });
  });

  describe("confirmObfuscationFunding", () => {
    it("confirms funding and checks if all funded", async () => {
      mocks.getSessionByRouteId.mockResolvedValue({ id: 1 });
      mocks.updateFundingStatusByIndex.mockResolvedValue(undefined);
      mocks.areAllWalletsFunded.mockResolvedValue(false);

      const result = await caller.confirmObfuscationFunding({
        routeId: 1,
        walletIndex: 0,
        txHash: "tx-hash",
      });

      expect(result.success).toBe(true);
      expect(result.data.allFunded).toBe(false);
    });

    it("schedules aggregation when all funded", async () => {
      mocks.getSessionByRouteId.mockResolvedValue({ id: 1 });
      mocks.updateFundingStatusByIndex.mockResolvedValue(undefined);
      mocks.areAllWalletsFunded.mockResolvedValue(true);

      const result = await caller.confirmObfuscationFunding({
        routeId: 1,
        walletIndex: 0,
        txHash: "tx-hash",
      });

      expect(result.data.allFunded).toBe(true);
      expect(mocks.scheduleAggregations).toHaveBeenCalledWith(1);
    });
  });

  describe("getObfuscationFundingTransactions", () => {
    it("returns funding transactions", async () => {
      mocks.getSessionByRouteId.mockResolvedValue({
        id: 1,
        intermediateCount: 3,
        tokenType: "SOL",
      });
      mocks.dbQueryRoutes.mockResolvedValue({
        id: 1,
        hopAmountRaw: "1000000",
        hops: [{ id: 1 }],
      });
      mocks.buildAllFundingTransactions.mockResolvedValue([
        { walletIndex: 0, serialized: "base64-tx-1", destinationAddress: "addr1", amount: 1000 },
        { walletIndex: 1, serialized: "base64-tx-2", destinationAddress: "addr2", amount: 1000 },
      ]);
      mocks.updateSessionStatus.mockResolvedValue(undefined);
      mocks.estimateObfuscationFees.mockResolvedValue({
        totalFeesLamports: 50000,
        fundingTxFees: 10000,
        aggregationTxFees: 10000,
        cleanupTxFees: 5000,
        intermediateAtaCreation: 15000,
        walletXAtaCreation: 5000,
        rentRecovery: 3000,
        dustRefund: 2000,
      });

      const result = await caller.getObfuscationFundingTransactions({
        routeId: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data.totalTransactions).toBe(2);
      expect(result.data.sessionId).toBe(1);
      expect(mocks.updateSessionStatus).toHaveBeenCalledWith(1, "funding");
    });

    it("throws when no session found", async () => {
      mocks.getSessionByRouteId.mockResolvedValue(null);

      await expect(
        caller.getObfuscationFundingTransactions({
          routeId: 1,
        })
      ).rejects.toThrow();
    });

    it("throws when route not found", async () => {
      mocks.getSessionByRouteId.mockResolvedValue({ id: 1 });
      mocks.dbQueryRoutes.mockResolvedValue(null);

      await expect(
        caller.getObfuscationFundingTransactions({
          routeId: 1,
        })
      ).rejects.toThrow();
    });
  });

  describe("confirmAllObfuscationFunding", () => {
    it("confirms all funding and schedules aggregation when all funded", async () => {
      mocks.getSessionByRouteId.mockResolvedValue({ id: 1 });
      mocks.updateFundingStatusByIndex.mockResolvedValue(undefined);
      mocks.areAllWalletsFunded.mockResolvedValue(true);

      const result = await caller.confirmAllObfuscationFunding({
        routeId: 1,
        fundingResults: [
          { walletIndex: 0, txHash: "tx-0" },
          { walletIndex: 1, txHash: "tx-1" },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.data.allFunded).toBe(true);
      expect(result.data.confirmedCount).toBe(2);
      expect(mocks.scheduleAggregations).toHaveBeenCalledWith(1);
    });

    it("does not schedule aggregation when not all funded", async () => {
      mocks.getSessionByRouteId.mockResolvedValue({ id: 1 });
      mocks.updateFundingStatusByIndex.mockResolvedValue(undefined);
      mocks.areAllWalletsFunded.mockResolvedValue(false);

      const result = await caller.confirmAllObfuscationFunding({
        routeId: 1,
        fundingResults: [{ walletIndex: 0, txHash: "tx-0" }],
      });

      expect(result.data.allFunded).toBe(false);
      expect(mocks.scheduleAggregations).not.toHaveBeenCalled();
    });

    it("throws when no session found", async () => {
      mocks.getSessionByRouteId.mockResolvedValue(null);

      await expect(
        caller.confirmAllObfuscationFunding({
          routeId: 1,
          fundingResults: [{ walletIndex: 0, txHash: "tx" }],
        })
      ).rejects.toThrow();
    });
  });

  describe("getObfuscationStatus", () => {
    it("returns status summary", async () => {
      mocks.getSessionByRouteId.mockResolvedValue({
        id: 1,
        status: "funding",
        intermediateCount: 3,
      });
      mocks.getIntermediateWallets.mockResolvedValue([
        { fundingStatus: "funded", aggregationStatus: "pending", cleanupStatus: "pending" },
        { fundingStatus: "funded", aggregationStatus: "confirmed", cleanupStatus: "completed" },
        { fundingStatus: "pending", aggregationStatus: "pending", cleanupStatus: "pending" },
      ]);

      const result = await caller.getObfuscationStatus({ routeId: 1 });

      expect(result.success).toBe(true);
      expect(result.data!.fundedCount).toBe(2);
      expect(result.data!.aggregatedCount).toBe(1);
      expect(result.data!.cleanedUpCount).toBe(1);
    });
  });
});
