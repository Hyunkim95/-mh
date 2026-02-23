import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import BN from "bn.js";

// Mock the database before importing the service
vi.mock("../db", () => ({
  db: {
    query: {
      obfuscationSessionsSchema: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}));

// Mock the config module
vi.mock("../config/config", () => ({
  config: {
    solanaRpcUrl: "https://api.mainnet-beta.solana.com",
  },
}));

// Mock @libs/solana-node - need to use a class for the constructor
vi.mock("@libs/solana-node", () => {
  class MockSolanaWalletManager {
    constructor() {}
    getOrCreateWallet = vi.fn().mockResolvedValue({
      id: 1,
      address: "MockWalletAddress111111111111111111111111",
    });
    getKeypair = vi.fn();
  }

  return {
    SolanaWalletManager: MockSolanaWalletManager,
  };
});

// Mock Solana connection - need to use a class for the constructor
vi.mock("@solana/web3.js", async () => {
  const actual = await vi.importActual("@solana/web3.js");

  class MockConnection {
    constructor() {}
    getLatestBlockhash = vi.fn().mockResolvedValue({
      blockhash: "mockBlockhash",
      lastValidBlockHeight: 100,
    });
  }

  return {
    ...actual,
    Connection: MockConnection,
    clusterApiUrl: () => "https://api.mainnet-beta.solana.com",
  };
});

// Import after mocks
import obfuscationService from "../obfuscation/services/obfuscation.service";

describe("ObfuscationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("generateRandomSplit", () => {
    it("should split total into exact sum", () => {
      const total = new BN(1000000);
      const count = 5;

      const splits = obfuscationService.generateRandomSplit(total, count);

      // Sum should equal total
      const sum = splits.reduce((acc, s) => acc.add(s), new BN(0));
      expect(sum.eq(total)).toBe(true);
    });

    it("should generate correct number of portions", () => {
      const total = new BN(1000000);
      const count = 7;

      const splits = obfuscationService.generateRandomSplit(total, count);

      expect(splits.length).toBe(count);
    });

    it("should not produce zero values for reasonable amounts", () => {
      const total = new BN(10000000); // 10 million lamports
      const count = 8;

      const splits = obfuscationService.generateRandomSplit(total, count);

      for (const split of splits) {
        expect(split.gt(new BN(0))).toBe(true);
      }
    });

    it("should return total when count is 1", () => {
      const total = new BN(5000000);

      const splits = obfuscationService.generateRandomSplit(total, 1);

      expect(splits.length).toBe(1);
      expect(splits[0].eq(total)).toBe(true);
    });

    it("should handle small amounts with multiple portions", () => {
      const total = new BN(100);
      const count = 5;

      const splits = obfuscationService.generateRandomSplit(total, count);

      const sum = splits.reduce((acc, s) => acc.add(s), new BN(0));
      expect(sum.eq(total)).toBe(true);
      // Should have some portions (may be less than count if total is too small)
      expect(splits.length).toBeGreaterThan(0);
    });

    it("should throw on count <= 0", () => {
      const total = new BN(1000000);

      expect(() => obfuscationService.generateRandomSplit(total, 0)).toThrow(
        "Count must be positive"
      );
      expect(() => obfuscationService.generateRandomSplit(total, -1)).toThrow(
        "Count must be positive"
      );
    });

    it("should throw on zero or negative total", () => {
      expect(() =>
        obfuscationService.generateRandomSplit(new BN(0), 5)
      ).toThrow("Total must be positive");
      expect(() =>
        obfuscationService.generateRandomSplit(new BN(-100), 5)
      ).toThrow("Total must be positive");
    });

    it("should produce different splits on multiple calls (randomness)", () => {
      const total = new BN(10000000);
      const count = 5;

      const splits1 = obfuscationService.generateRandomSplit(total, count);
      const splits2 = obfuscationService.generateRandomSplit(total, count);

      // While not guaranteed, it's highly unlikely two random splits are identical
      // We check if at least one element differs
      const areIdentical = splits1.every((s, i) => s.eq(splits2[i]));
      // This test may occasionally fail due to randomness, but probability is extremely low
      // for large totals with multiple portions
      expect(areIdentical).toBe(false);
    });
  });

  describe("estimateObfuscationFees", () => {
    const { constants } = obfuscationService;

    it("should calculate correct fees for SOL transfers", () => {
      const intermediateCount = 6;

      const estimate = obfuscationService.estimateObfuscationFees(
        intermediateCount,
        "SOL"
      );

      // For SOL, no ATA creation costs
      expect(estimate.intermediateAtaCreation).toBe(0);
      expect(estimate.walletXAtaCreation).toBe(0);

      // Transaction fees
      const txFee =
        constants.BASE_TX_FEE_LAMPORTS + constants.ESTIMATED_PRIORITY_FEE_LAMPORTS;
      expect(estimate.fundingTxFees).toBe(intermediateCount * txFee);
      expect(estimate.aggregationTxFees).toBe(intermediateCount * txFee);

      // Cleanup fees (cheaper, no priority)
      expect(estimate.cleanupTxFees).toBe(
        (intermediateCount + 1) * constants.BASE_TX_FEE_LAMPORTS
      );

      // No rent recovery for SOL
      expect(estimate.rentRecovery).toBe(0);
    });

    it("should calculate correct fees for SPL tokens (includes ATA rent)", () => {
      const intermediateCount = 5;

      const estimate = obfuscationService.estimateObfuscationFees(
        intermediateCount,
        "SPL"
      );

      // ATA creation costs
      expect(estimate.intermediateAtaCreation).toBe(
        intermediateCount * constants.ATA_RENT_LAMPORTS
      );
      expect(estimate.walletXAtaCreation).toBe(constants.ATA_RENT_LAMPORTS);

      // Rent recovery when closing ATAs
      const expectedRentRecovery =
        (intermediateCount + 1) *
        (constants.ATA_RENT_LAMPORTS - constants.BASE_TX_FEE_LAMPORTS);
      expect(estimate.rentRecovery).toBe(expectedRentRecovery);
    });

    it("should calculate net obfuscation cost correctly", () => {
      const intermediateCount = 6;

      const estimate = obfuscationService.estimateObfuscationFees(
        intermediateCount,
        "SPL"
      );

      // Verify net cost calculation
      const expectedNet =
        estimate.intermediateAtaCreation +
        estimate.walletXAtaCreation +
        estimate.fundingTxFees +
        estimate.aggregationTxFees +
        estimate.cleanupTxFees -
        estimate.rentRecovery;

      expect(estimate.netObfuscationCost).toBe(expectedNet);
    });

    it("should return non-negative totalFeesLamports", () => {
      // Test with various counts
      for (let count = 5; count <= 8; count++) {
        const solEstimate = obfuscationService.estimateObfuscationFees(
          count,
          "SOL"
        );
        const splEstimate = obfuscationService.estimateObfuscationFees(
          count,
          "SPL"
        );

        expect(solEstimate.totalFeesLamports).toBeGreaterThanOrEqual(0);
        expect(splEstimate.totalFeesLamports).toBeGreaterThanOrEqual(0);
      }
    });

    it("should have higher costs for more intermediate wallets", () => {
      const estimate5 = obfuscationService.estimateObfuscationFees(5, "SPL");
      const estimate8 = obfuscationService.estimateObfuscationFees(8, "SPL");

      expect(estimate8.fundingTxFees).toBeGreaterThan(estimate5.fundingTxFees);
      expect(estimate8.intermediateAtaCreation).toBeGreaterThan(
        estimate5.intermediateAtaCreation
      );
    });
  });

  describe("constants", () => {
    it("should export expected constants", () => {
      const { constants } = obfuscationService;

      expect(constants.MIN_INTERMEDIATE_WALLETS).toBe(5);
      expect(constants.MAX_INTERMEDIATE_WALLETS).toBe(8);
      expect(constants.ATA_RENT_LAMPORTS).toBe(2039280);
      expect(constants.BASE_TX_FEE_LAMPORTS).toBe(5000);
      expect(constants.ESTIMATED_PRIORITY_FEE_LAMPORTS).toBe(200000);
    });

    it("should have min delay less than max delay", () => {
      const { constants } = obfuscationService;

      expect(constants.MIN_AGGREGATION_DELAY_MS).toBeLessThan(
        constants.MAX_AGGREGATION_DELAY_MS
      );
    });
  });
});
