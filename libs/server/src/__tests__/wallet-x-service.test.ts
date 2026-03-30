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
  obfuscationService: {
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
  intermediateWalletService: {
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
import { walletXService } from "../obfuscation/services/wallet-x.service";
import { obfuscationService } from "../obfuscation/services/obfuscation.service";
import { intermediateWalletService } from "../obfuscation/services/intermediate-wallet.service";

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

  describe("getKeypairByRouteId", () => {
    it("should return null when no session exists for route", async () => {
      vi.mocked(obfuscationService.getSessionByRouteId).mockResolvedValue(null);

      const result = await walletXService.getKeypairByRouteId(999);

      expect(result).toBeNull();
    });

    it("should return keypair for valid route", async () => {
      const mockKeypair = Keypair.generate();
      vi.mocked(obfuscationService.getSessionByRouteId).mockResolvedValue(mockSession as any);
      mockFindFirst.mockResolvedValue(mockSession);
      mockGetKeypairFromWallet.mockReturnValue(mockKeypair);

      const result = await walletXService.getKeypairByRouteId(1);

      expect(result).toBe(mockKeypair);
    });

    it("should return null when session exists but wallet X has no keypair", async () => {
      vi.mocked(obfuscationService.getSessionByRouteId).mockResolvedValue(mockSession as any);
      mockFindFirst.mockResolvedValue({ ...mockSession, walletX: null });

      const result = await walletXService.getKeypairByRouteId(1);

      expect(result).toBeNull();
    });
  });

  describe("getTokenBalance", () => {
    it("should return zero when session does not exist", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await walletXService.getTokenBalance(999, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

      expect(result.toNumber()).toBe(0);
    });

    it("should return token balance when ATA exists", async () => {
      mockFindFirst.mockResolvedValue(mockSession);
      mockGetAssociatedTokenAddress.mockResolvedValue(new PublicKey("11111111111111111111111111111111"));
      mockGetAccount.mockResolvedValue({ amount: BigInt(5000000) });

      const result = await walletXService.getTokenBalance(1, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

      expect(result.toNumber()).toBe(5000000);
    });

    it("should return zero when ATA does not exist", async () => {
      mockFindFirst.mockResolvedValue(mockSession);
      mockGetAssociatedTokenAddress.mockResolvedValue(new PublicKey("11111111111111111111111111111111"));
      mockGetAccount.mockRejectedValue(new Error("Account does not exist"));

      const result = await walletXService.getTokenBalance(1, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

      expect(result.toNumber()).toBe(0);
    });
  });

  describe("hasReceivedAllFunds (SPL path)", () => {
    const splSession = {
      ...mockSession,
      tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tokenType: "SPL",
    };

    it("should return true when SPL balance >= expected amount", async () => {
      vi.mocked(obfuscationService.getSession).mockResolvedValue(splSession as any);
      vi.mocked(intermediateWalletService.areAllWalletsAggregated).mockResolvedValue(true);
      mockFindFirst.mockResolvedValue({ ...mockSession, walletX: mockCustodialWallet });
      mockGetAssociatedTokenAddress.mockResolvedValue(new PublicKey("11111111111111111111111111111111"));
      mockGetAccount.mockResolvedValue({ amount: BigInt("1000000000") }); // Matches totalAmount

      const result = await walletXService.hasReceivedAllFunds(1);

      expect(result).toBe(true);
    });

    it("should return false when SPL balance < expected amount", async () => {
      vi.mocked(obfuscationService.getSession).mockResolvedValue(splSession as any);
      vi.mocked(intermediateWalletService.areAllWalletsAggregated).mockResolvedValue(true);
      mockFindFirst.mockResolvedValue({ ...mockSession, walletX: mockCustodialWallet });
      mockGetAssociatedTokenAddress.mockResolvedValue(new PublicKey("11111111111111111111111111111111"));
      mockGetAccount.mockResolvedValue({ amount: BigInt("500000000") }); // Less than totalAmount

      const result = await walletXService.hasReceivedAllFunds(1);

      expect(result).toBe(false);
    });

    it("should return false when SPL ATA does not exist", async () => {
      vi.mocked(obfuscationService.getSession).mockResolvedValue(splSession as any);
      vi.mocked(intermediateWalletService.areAllWalletsAggregated).mockResolvedValue(true);
      mockFindFirst.mockResolvedValue({ ...mockSession, walletX: mockCustodialWallet });
      mockGetAssociatedTokenAddress.mockResolvedValue(new PublicKey("11111111111111111111111111111111"));
      mockGetAccount.mockRejectedValue(new Error("Account does not exist"));

      const result = await walletXService.hasReceivedAllFunds(1);

      expect(result).toBe(false);
    });
  });

  describe("hasReceivedAllFunds (unknown token type)", () => {
    it("should return false when tokenType is not SOL and tokenMint is null", async () => {
      const weirdSession = {
        ...mockSession,
        tokenType: "UNKNOWN",
        tokenMint: null,
      };
      vi.mocked(obfuscationService.getSession).mockResolvedValue(weirdSession as any);
      vi.mocked(intermediateWalletService.areAllWalletsAggregated).mockResolvedValue(true);

      const result = await walletXService.hasReceivedAllFunds(1);

      expect(result).toBe(false);
    });
  });

  describe("getSOLBalance (RPC failure)", () => {
    it("should propagate RPC error when getBalance fails", async () => {
      mockFindFirst.mockResolvedValue(mockSession);
      mockGetBalance.mockRejectedValue(new Error("503 Service Unavailable"));

      await expect(walletXService.getSOLBalance(1)).rejects.toThrow("503 Service Unavailable");
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
