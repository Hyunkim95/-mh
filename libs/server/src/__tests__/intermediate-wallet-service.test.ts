import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to create mock functions that can be used in vi.mock
const { mockFindMany, mockFindFirst, mockUpdate } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
}));

// Mock the database
vi.mock("../db", () => ({
  db: {
    query: {
      intermediateWalletsSchema: {
        findFirst: mockFindFirst,
        findMany: mockFindMany,
      },
    },
    update: () => ({
      set: () => ({
        where: mockUpdate,
      }),
    }),
  },
}));

// Mock obfuscation service
vi.mock("../obfuscation/services/obfuscation.service", () => ({
  default: {
    getWalletManager: () => ({
      getKeypairFromWallet: vi.fn(),
    }),
    getConnection: vi.fn(),
  },
}));

// Mock @libs/crypto-utils
vi.mock("@libs/crypto-utils", () => ({
  CustodialWallet: {},
}));

// Import after mocks
import intermediateWalletService from "../obfuscation/services/intermediate-wallet.service";

// Helper to create mock wallet data
function createMockWallet(
  overrides: Partial<{
    id: number;
    sessionId: number;
    walletIndex: number;
    fundingStatus: string;
    aggregationStatus: string;
    cleanupStatus: string;
    aggregationScheduledAt: Date | null;
    custodialWallet: { address: string };
  }> = {}
) {
  return {
    id: 1,
    sessionId: 1,
    walletIndex: 0,
    allocatedAmount: "1000000",
    fundingStatus: "pending",
    aggregationStatus: "pending",
    cleanupStatus: "pending",
    aggregationScheduledAt: null,
    fundingTxHash: null,
    aggregationTxHash: null,
    dustReturnTxHash: null,
    ataCloseTxHash: null,
    fundedAt: null,
    aggregatedAt: null,
    cleanedUpAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    custodialWalletId: 1,
    custodialWallet: {
      id: 1,
      address: "MockAddress111111111111111111111111111111",
      encryptedPrivateKey: "encrypted",
      createdAt: new Date(),
    },
    ...overrides,
  };
}

describe("IntermediateWalletService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("areAllWalletsFunded", () => {
    it("should return true when all wallets are funded", async () => {
      const mockWallets = [
        createMockWallet({ id: 1, walletIndex: 0, fundingStatus: "funded" }),
        createMockWallet({ id: 2, walletIndex: 1, fundingStatus: "funded" }),
        createMockWallet({ id: 3, walletIndex: 2, fundingStatus: "funded" }),
      ];
      mockFindMany.mockResolvedValue(mockWallets);

      const result = await intermediateWalletService.areAllWalletsFunded(1);

      expect(result).toBe(true);
    });

    it("should return false when some wallets are not funded", async () => {
      const mockWallets = [
        createMockWallet({ id: 1, walletIndex: 0, fundingStatus: "funded" }),
        createMockWallet({ id: 2, walletIndex: 1, fundingStatus: "pending" }),
        createMockWallet({ id: 3, walletIndex: 2, fundingStatus: "funded" }),
      ];
      mockFindMany.mockResolvedValue(mockWallets);

      const result = await intermediateWalletService.areAllWalletsFunded(1);

      expect(result).toBe(false);
    });

    it("should return false when all wallets are pending", async () => {
      const mockWallets = [
        createMockWallet({ id: 1, walletIndex: 0, fundingStatus: "pending" }),
        createMockWallet({ id: 2, walletIndex: 1, fundingStatus: "pending" }),
      ];
      mockFindMany.mockResolvedValue(mockWallets);

      const result = await intermediateWalletService.areAllWalletsFunded(1);

      expect(result).toBe(false);
    });

    it("should return true for empty wallet list", async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await intermediateWalletService.areAllWalletsFunded(1);

      // Array.every returns true for empty arrays
      expect(result).toBe(true);
    });
  });

  describe("areAllWalletsAggregated", () => {
    it("should return true when all wallets are aggregated", async () => {
      const mockWallets = [
        createMockWallet({
          id: 1,
          walletIndex: 0,
          aggregationStatus: "confirmed",
        }),
        createMockWallet({
          id: 2,
          walletIndex: 1,
          aggregationStatus: "confirmed",
        }),
      ];
      mockFindMany.mockResolvedValue(mockWallets);

      const result = await intermediateWalletService.areAllWalletsAggregated(1);

      expect(result).toBe(true);
    });

    it("should return false when some wallets are not aggregated", async () => {
      const mockWallets = [
        createMockWallet({
          id: 1,
          walletIndex: 0,
          aggregationStatus: "confirmed",
        }),
        createMockWallet({
          id: 2,
          walletIndex: 1,
          aggregationStatus: "scheduled",
        }),
        createMockWallet({ id: 3, walletIndex: 2, aggregationStatus: "sent" }),
      ];
      mockFindMany.mockResolvedValue(mockWallets);

      const result = await intermediateWalletService.areAllWalletsAggregated(1);

      expect(result).toBe(false);
    });

    it("should return false when wallets are in failed state", async () => {
      const mockWallets = [
        createMockWallet({
          id: 1,
          walletIndex: 0,
          aggregationStatus: "confirmed",
        }),
        createMockWallet({
          id: 2,
          walletIndex: 1,
          aggregationStatus: "failed",
        }),
      ];
      mockFindMany.mockResolvedValue(mockWallets);

      const result = await intermediateWalletService.areAllWalletsAggregated(1);

      expect(result).toBe(false);
    });
  });

  describe("areAllWalletsCleanedUp", () => {
    it("should return true when all wallets are cleaned up", async () => {
      const mockWallets = [
        createMockWallet({ id: 1, walletIndex: 0, cleanupStatus: "completed" }),
        createMockWallet({ id: 2, walletIndex: 1, cleanupStatus: "completed" }),
      ];
      mockFindMany.mockResolvedValue(mockWallets);

      const result = await intermediateWalletService.areAllWalletsCleanedUp(1);

      expect(result).toBe(true);
    });

    it("should return false when some wallets are pending cleanup", async () => {
      const mockWallets = [
        createMockWallet({ id: 1, walletIndex: 0, cleanupStatus: "completed" }),
        createMockWallet({ id: 2, walletIndex: 1, cleanupStatus: "pending" }),
      ];
      mockFindMany.mockResolvedValue(mockWallets);

      const result = await intermediateWalletService.areAllWalletsCleanedUp(1);

      expect(result).toBe(false);
    });
  });

  describe("getWalletsReadyForAggregation", () => {
    it("should return wallets that are funded and scheduled in the past", async () => {
      const pastTime = new Date(Date.now() - 60000); // 1 minute ago
      const mockWallets = [
        createMockWallet({
          id: 1,
          walletIndex: 0,
          fundingStatus: "funded",
          aggregationStatus: "scheduled",
          aggregationScheduledAt: pastTime,
        }),
        createMockWallet({
          id: 2,
          walletIndex: 1,
          fundingStatus: "funded",
          aggregationStatus: "scheduled",
          aggregationScheduledAt: pastTime,
        }),
      ];
      mockFindMany.mockResolvedValue(mockWallets);

      const result =
        await intermediateWalletService.getWalletsReadyForAggregation();

      expect(result).toHaveLength(2);
      expect(mockFindMany).toHaveBeenCalled();
    });

    it("should accept a custom current time", async () => {
      const customTime = new Date("2025-01-15T12:00:00.000Z");
      mockFindMany.mockResolvedValue([]);

      await intermediateWalletService.getWalletsReadyForAggregation(customTime);

      expect(mockFindMany).toHaveBeenCalled();
    });

    it("should return empty array when no wallets are ready", async () => {
      mockFindMany.mockResolvedValue([]);

      const result =
        await intermediateWalletService.getWalletsReadyForAggregation();

      expect(result).toHaveLength(0);
    });
  });

  describe("getWalletsPendingCleanup", () => {
    it("should return wallets with pending cleanup status", async () => {
      const mockWallets = [
        createMockWallet({ id: 1, walletIndex: 0, cleanupStatus: "pending" }),
        createMockWallet({ id: 2, walletIndex: 1, cleanupStatus: "pending" }),
      ];
      mockFindMany.mockResolvedValue(mockWallets);

      const result =
        await intermediateWalletService.getWalletsPendingCleanup(1);

      expect(result).toHaveLength(2);
    });

    it("should not include completed wallets", async () => {
      // The mock returns only pending wallets (database filters)
      mockFindMany.mockResolvedValue([]);

      const result =
        await intermediateWalletService.getWalletsPendingCleanup(1);

      expect(result).toHaveLength(0);
    });
  });

  describe("getIntermediateWalletWithCustodial", () => {
    it("should return wallet with custodial data", async () => {
      const mockWallet = createMockWallet({ id: 1 });
      mockFindFirst.mockResolvedValue(mockWallet);

      const result =
        await intermediateWalletService.getIntermediateWalletWithCustodial(1);

      expect(result).toEqual(mockWallet);
      expect(result?.custodialWallet.address).toBe(
        "MockAddress111111111111111111111111111111"
      );
    });

    it("should return null for non-existent wallet", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result =
        await intermediateWalletService.getIntermediateWalletWithCustodial(999);

      expect(result).toBeNull();
    });
  });

  describe("getWalletBySessionAndIndex", () => {
    it("should return wallet by session and index", async () => {
      const mockWallet = createMockWallet({ sessionId: 1, walletIndex: 2 });
      mockFindFirst.mockResolvedValue(mockWallet);

      const result =
        await intermediateWalletService.getWalletBySessionAndIndex(1, 2);

      expect(result).toEqual(mockWallet);
    });

    it("should return null if not found", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result =
        await intermediateWalletService.getWalletBySessionAndIndex(1, 99);

      expect(result).toBeNull();
    });
  });

  describe("updateFundingStatus", () => {
    it("should update funding status", async () => {
      mockUpdate.mockResolvedValue(undefined);

      await intermediateWalletService.updateFundingStatus(1, "funded", "txhash123");

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe("updateAggregationStatus", () => {
    it("should update aggregation status", async () => {
      mockUpdate.mockResolvedValue(undefined);

      await intermediateWalletService.updateAggregationStatus(
        1,
        "confirmed",
        "txhash456"
      );

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe("updateCleanupStatus", () => {
    it("should update cleanup status with transaction hashes", async () => {
      mockUpdate.mockResolvedValue(undefined);

      await intermediateWalletService.updateCleanupStatus(
        1,
        "completed",
        "dustTx",
        "closeTx"
      );

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe("setError", () => {
    it("should set error on wallet", async () => {
      mockUpdate.mockResolvedValue(undefined);

      await intermediateWalletService.setError(1, "Test error message");

      expect(mockUpdate).toHaveBeenCalled();
    });
  });
});
