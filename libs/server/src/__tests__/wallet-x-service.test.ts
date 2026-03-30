import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// Use vi.hoisted to create mock functions
const { mockFindFirst, mockGetBalance, mockGetKeypairFromWallet } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockGetBalance: vi.fn(),
  mockGetKeypairFromWallet: vi.fn(),
}));

// Mock the database
vi.mock("../db", () => ({
  db: {
    query: {
      obfuscationSessionsSchema: {
        findFirst: mockFindFirst,
      },
    },
  },
}));

// Mock connection class
class MockConnection {
  getBalance = mockGetBalance;
  getLatestBlockhash = vi.fn().mockResolvedValue({
    blockhash: "mockBlockhash",
    lastValidBlockHeight: 100,
  });
}

// Mock obfuscation service
vi.mock("../obfuscation/services/obfuscation.service", () => ({
  default: {
    getWalletManager: () => ({
      getKeypairFromWallet: mockGetKeypairFromWallet,
    }),
    getConnection: () => new MockConnection(),
    getSessionByRouteId: vi.fn(),
    getSession: vi.fn(),
  },
}));

// Mock intermediate wallet service
vi.mock("../obfuscation/services/intermediate-wallet.service", () => ({
  default: {
    areAllWalletsAggregated: vi.fn(),
  },
}));

// Mock @libs/crypto-utils
vi.mock("@libs/crypto-utils", () => ({
  CustodialWallet: {},
}));

// Mock @solana/spl-token - use hoisted mock functions
const { mockGetAssociatedTokenAddress, mockGetAccount } = vi.hoisted(() => ({
  mockGetAssociatedTokenAddress: vi.fn(),
  mockGetAccount: vi.fn(),
}));

vi.mock("@solana/spl-token", () => ({
  getAssociatedTokenAddress: mockGetAssociatedTokenAddress,
  getAccount: mockGetAccount,
}));

// Import after mocks
import walletXService from "../obfuscation/services/wallet-x.service";
import obfuscationService from "../obfuscation/services/obfuscation.service";
import intermediateWalletService from "../obfuscation/services/intermediate-wallet.service";

// Mock wallet data - use a valid base58 public key
const mockCustodialWallet = {
  id: 1,
  address: "11111111111111111111111111111111", // Valid System Program address
  encryptedPrivateKey: "encrypted",
  createdAt: new Date(),
};

const mockSession = {
  id: 1,
  routeId: 1,
  status: "aggregating",
  walletXId: 1,
  intermediateCount: 6,
  tokenMint: null,
  tokenType: "SOL",
  totalAmount: "1000000000",
  estimatedFeesLamports: "100000",
  actualFeesLamports: null,
  createdAt: new Date(),
  startedAt: null,
  completedAt: null,
  lastError: null,
  retryCount: 0,
  walletX: mockCustodialWallet,
};

describe("WalletXService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("getWalletX", () => {
    it("should return wallet X data for valid session", async () => {
      mockFindFirst.mockResolvedValue(mockSession);

      const result = await walletXService.getWalletX(1);

      expect(result).toEqual(mockCustodialWallet);
      expect(mockFindFirst).toHaveBeenCalled();
    });

    it("should return null for non-existent session", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await walletXService.getWalletX(999);

      expect(result).toBeNull();
    });

    it("should return null if session has no wallet X", async () => {
      mockFindFirst.mockResolvedValue({ ...mockSession, walletX: null });

      const result = await walletXService.getWalletX(1);

      expect(result).toBeNull();
    });
  });

  describe("getPublicKey", () => {
    it("should return PublicKey for valid wallet X", async () => {
      mockFindFirst.mockResolvedValue(mockSession);

      const result = await walletXService.getPublicKey(1);

      expect(result).toBeInstanceOf(PublicKey);
      expect(result?.toBase58()).toBe("11111111111111111111111111111111");
    });

    it("should return null for non-existent session", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await walletXService.getPublicKey(999);

      expect(result).toBeNull();
    });
  });

  describe("getKeypair", () => {
    it("should return Keypair from wallet manager", async () => {
      const mockKeypair = Keypair.generate();
      mockFindFirst.mockResolvedValue(mockSession);
      mockGetKeypairFromWallet.mockReturnValue(mockKeypair);

      const result = await walletXService.getKeypair(1);

      expect(result).toBe(mockKeypair);
      expect(mockGetKeypairFromWallet).toHaveBeenCalledWith(mockCustodialWallet);
    });

    it("should return null if no wallet X found", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await walletXService.getKeypair(999);

      expect(result).toBeNull();
    });
  });

  describe("getSOLBalance", () => {
    it("should return SOL balance as BN", async () => {
      mockFindFirst.mockResolvedValue(mockSession);
      mockGetBalance.mockResolvedValue(5000000000); // 5 SOL

      const result = await walletXService.getSOLBalance(1);

      expect(result).toBeInstanceOf(BN);
      expect(result.toNumber()).toBe(5000000000);
    });

    it("should return zero for non-existent session", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await walletXService.getSOLBalance(999);

      expect(result.toNumber()).toBe(0);
    });
  });

  describe("isAggregationComplete", () => {
    it("should return true when all wallets aggregated", async () => {
      vi.mocked(intermediateWalletService.areAllWalletsAggregated).mockResolvedValue(true);

      const result = await walletXService.isAggregationComplete(1);

      expect(result).toBe(true);
    });

    it("should return false when some wallets not aggregated", async () => {
      vi.mocked(intermediateWalletService.areAllWalletsAggregated).mockResolvedValue(false);

      const result = await walletXService.isAggregationComplete(1);

      expect(result).toBe(false);
    });
  });

  describe("hasReceivedAllFunds", () => {
    it("should return false when session not found", async () => {
      vi.mocked(obfuscationService.getSession).mockResolvedValue(null);

      const result = await walletXService.hasReceivedAllFunds(999);

      expect(result).toBe(false);
    });

    it("should return false when not all wallets aggregated", async () => {
      vi.mocked(obfuscationService.getSession).mockResolvedValue(mockSession as any);
      vi.mocked(intermediateWalletService.areAllWalletsAggregated).mockResolvedValue(false);

      const result = await walletXService.hasReceivedAllFunds(1);

      expect(result).toBe(false);
    });

    it("should return true for SOL when balance > 0 and all aggregated", async () => {
      vi.mocked(obfuscationService.getSession).mockResolvedValue(mockSession as any);
      vi.mocked(intermediateWalletService.areAllWalletsAggregated).mockResolvedValue(true);
      mockFindFirst.mockResolvedValue(mockSession);
      mockGetBalance.mockResolvedValue(1000000000);

      const result = await walletXService.hasReceivedAllFunds(1);

      expect(result).toBe(true);
    });

    it("should return false for SOL when balance is 0", async () => {
      vi.mocked(obfuscationService.getSession).mockResolvedValue(mockSession as any);
      vi.mocked(intermediateWalletService.areAllWalletsAggregated).mockResolvedValue(true);
      mockFindFirst.mockResolvedValue(mockSession);
      mockGetBalance.mockResolvedValue(0);

      const result = await walletXService.hasReceivedAllFunds(1);

      expect(result).toBe(false);
    });
  });

  describe("getSessionForWalletX", () => {
    it("should return session from obfuscation service", async () => {
      vi.mocked(obfuscationService.getSession).mockResolvedValue(mockSession as any);

      const result = await walletXService.getSessionForWalletX(1);

      expect(result).toEqual(mockSession);
      expect(obfuscationService.getSession).toHaveBeenCalledWith(1);
    });

    it("should return null for non-existent session", async () => {
      vi.mocked(obfuscationService.getSession).mockResolvedValue(null);

      const result = await walletXService.getSessionForWalletX(999);

      expect(result).toBeNull();
    });
  });

  describe("getWalletXByRouteId", () => {
    it("should return wallet X for valid route", async () => {
      vi.mocked(obfuscationService.getSessionByRouteId).mockResolvedValue(mockSession as any);
      mockFindFirst.mockResolvedValue(mockSession);

      const result = await walletXService.getWalletXByRouteId(1);

      expect(result).toEqual(mockCustodialWallet);
    });

    it("should return null if no session for route", async () => {
      vi.mocked(obfuscationService.getSessionByRouteId).mockResolvedValue(null);

      const result = await walletXService.getWalletXByRouteId(999);

      expect(result).toBeNull();
    });
  });
});
