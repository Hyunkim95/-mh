import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublicKey, Keypair, Transaction, SystemInstruction } from "@solana/web3.js";

// Mock config first - this must be before other mocks that might use it
vi.mock("../config/config", () => ({
  config: {
    solanaRpcUrl: "https://api.mainnet-beta.solana.com",
  },
}));

// Use vi.hoisted to create mock functions
const {
  mockGetSessionWithWallets,
  mockGetSession,
  mockGetWalletX,
  mockGetIntermediateWalletWithCustodial,
  mockGetKeypairForWallet,
  mockGetKeypair,
  mockGetBalance,
  mockGetLatestBlockhash,
  mockSendRawTransaction,
  mockConfirmTransaction,
  mockGetAssociatedTokenAddress,
  mockGetAccount,
  mockCreateDynamicPriorityInstructions,
  mockSerialize,
  mockDbSelect,
  mockGetRecommendedPriorityFee,
  mockCreateComputeUnitLimitInstruction,
  mockCreatePriorityFeeInstruction,
} = vi.hoisted(() => ({
  mockGetSessionWithWallets: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetWalletX: vi.fn(),
  mockGetIntermediateWalletWithCustodial: vi.fn(),
  mockGetKeypairForWallet: vi.fn(),
  mockGetKeypair: vi.fn(),
  mockGetBalance: vi.fn(),
  mockGetLatestBlockhash: vi.fn(),
  mockSendRawTransaction: vi.fn(),
  mockConfirmTransaction: vi.fn(),
  mockGetAssociatedTokenAddress: vi.fn(),
  mockGetAccount: vi.fn(),
  mockCreateDynamicPriorityInstructions: vi.fn(),
  mockSerialize: vi.fn(),
  mockDbSelect: vi.fn(),
  mockGetRecommendedPriorityFee: vi.fn(),
  mockCreateComputeUnitLimitInstruction: vi.fn(),
  mockCreatePriorityFeeInstruction: vi.fn(),
}));

// Mock connection class
class MockConnection {
  getBalance = mockGetBalance;
  getLatestBlockhash = mockGetLatestBlockhash;
  sendRawTransaction = mockSendRawTransaction;
  confirmTransaction = mockConfirmTransaction;
}

// Mock db module (used for hop count query)
vi.mock("../db", () => ({
  db: {
    select: mockDbSelect,
  },
}));

// Mock hops schema
vi.mock("../hops/schema/hops.schema", () => ({
  hopsSchema: { routeId: "route_id" },
}));

// Mock obfuscation service
vi.mock("../obfuscation/services/obfuscation.service", () => ({
  obfuscationService: {
    getConnection: () => new MockConnection(),
    getSessionWithWallets: mockGetSessionWithWallets,
    getSession: mockGetSession,
    getWalletManager: () => ({}),
    getDeploymentCost: () => 100_000_000, // 0.1 SOL mock
    getMinLamportsPerWallet: vi.fn().mockResolvedValue(1_075_880),
    getDynamicFees: vi.fn().mockResolvedValue({
      ataRentLamports: 2039280,
      rentExemptMinimumLamports: 890880,
      priorityFeeLamports: 180000, // 150k * 1.2
      lastUpdated: new Date(),
    }),
    constants: {
      BASE_TX_FEE_LAMPORTS: 5000,
      AGGREGATION_FEE_PER_WALLET: 2_500_000,
      FALLBACK_RENT_EXEMPT_MINIMUM_LAMPORTS: 890880,
      RENT_EXEMPT_MINIMUM_LAMPORTS: 890880,
      ATA_RENT_LAMPORTS: 2039280,
      WALLET_X_CLEANUP_BUFFER_LAMPORTS: 3_000_000,
    },
  },
}));

// Mock intermediate wallet service
vi.mock("../obfuscation/services/intermediate-wallet.service", () => ({
  intermediateWalletService: {
    getIntermediateWalletWithCustodial: mockGetIntermediateWalletWithCustodial,
    getKeypairForWallet: mockGetKeypairForWallet,
  },
}));

// Mock wallet X service
vi.mock("../obfuscation/services/wallet-x.service", () => ({
  walletXService: {
    getWalletX: mockGetWalletX,
    getKeypair: mockGetKeypair,
  },
}));

// Mock SPL token
vi.mock("@solana/spl-token", () => ({
  getAssociatedTokenAddress: mockGetAssociatedTokenAddress,
  getAccount: mockGetAccount,
  createAssociatedTokenAccountInstruction: vi.fn().mockReturnValue({
    keys: [],
    programId: new PublicKey("11111111111111111111111111111111"),
    data: Buffer.from([]),
  }),
  createTransferInstruction: vi.fn().mockReturnValue({
    keys: [],
    programId: new PublicKey("11111111111111111111111111111111"),
    data: Buffer.from([]),
  }),
  createCloseAccountInstruction: vi.fn().mockReturnValue({
    keys: [],
    programId: new PublicKey("11111111111111111111111111111111"),
    data: Buffer.from([]),
  }),
}));

// Mock contract service
vi.mock("../solana/services/contract.service", () => ({
  createDynamicPriorityInstructions: mockCreateDynamicPriorityInstructions,
  serialize: mockSerialize,
  getRecommendedPriorityFee: mockGetRecommendedPriorityFee,
  createComputeUnitLimitInstruction: mockCreateComputeUnitLimitInstruction,
  createPriorityFeeInstruction: mockCreatePriorityFeeInstruction,
}));

// Import after mocks
import { obfuscationTxBuilder } from "../obfuscation/services/obfuscation-tx-builder.service";

// Mock session data
const mockSession = {
  id: 1,
  routeId: 1,
  status: "funding",
  walletXId: 1,
  intermediateCount: 3,
  tokenMint: null, // SOL transfer
  tokenType: "SOL",
  totalAmount: "1000000000",
  intermediateWallets: [
    {
      id: 1,
      walletIndex: 0,
      allocatedAmount: "400000000",
      fundingStatus: "pending",
      address: "11111111111111111111111111111111",
    },
    {
      id: 2,
      walletIndex: 1,
      allocatedAmount: "300000000",
      fundingStatus: "pending",
      address: "11111111111111111111111111111112",
    },
    {
      id: 3,
      walletIndex: 2,
      allocatedAmount: "300000000",
      fundingStatus: "funded", // Already funded
      address: "11111111111111111111111111111113",
    },
  ],
};

const mockIntermediateWallet = {
  id: 1,
  sessionId: 1,
  walletIndex: 0,
  allocatedAmount: "400000000",
  fundingStatus: "funded",
  custodialWallet: {
    id: 1,
    address: "11111111111111111111111111111111",
  },
};

const mockCustodialWallet = {
  id: 1,
  address: "11111111111111111111111111111111",
  encryptedPrivateKey: "encrypted",
};

describe("ObfuscationTxBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock returns
    // Mock db.select().from().where() chain for hop count query
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]),
      }),
    });
    mockGetLatestBlockhash.mockResolvedValue({
      blockhash: "GpRvVHUxJqJcLwBsFBF8j8xNuAmMdAkPjVGJLu8LLNDB",
      lastValidBlockHeight: 100,
    });
    mockGetBalance.mockResolvedValue(5000000000); // 5 SOL
    // Return 2 mock priority instructions so cleanup transactions pass the instructions.length > 2 check
    const mockPriorityIx = {
      keys: [],
      programId: new PublicKey("ComputeBudget111111111111111111111111111111"),
      data: Buffer.from([]),
    };
    mockCreateDynamicPriorityInstructions.mockResolvedValue([mockPriorityIx, mockPriorityIx]);
    mockCreateComputeUnitLimitInstruction.mockReturnValue(mockPriorityIx);
    mockCreatePriorityFeeInstruction.mockReturnValue(mockPriorityIx);
    mockGetRecommendedPriorityFee.mockResolvedValue(50000);
    mockSerialize.mockResolvedValue({
      transaction: "serializedTxBase64",
      blockhash: "GpRvVHUxJqJcLwBsFBF8j8xNuAmMdAkPjVGJLu8LLNDB",
    });
    mockSendRawTransaction.mockResolvedValue("mockSignature123");
    mockConfirmTransaction.mockResolvedValue({ value: { err: null } });
  });

  describe("buildAllFundingTransactions", () => {
    it("should throw error when session not found", async () => {
      mockGetSessionWithWallets.mockResolvedValue(null);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");

      await expect(
        obfuscationTxBuilder.buildAllFundingTransactions(999, sourceWallet)
      ).rejects.toThrow("Session not found");
    });

    it("should skip already funded wallets", async () => {
      mockGetSessionWithWallets.mockResolvedValue(mockSession);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");

      const results = await obfuscationTxBuilder.buildAllFundingTransactions(
        1,
        sourceWallet
      );

      // Should only build transactions for 2 wallets (skipping the funded one)
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.walletIndex)).toEqual([0, 1]);
    });

    it("should return correct wallet info in results", async () => {
      mockGetSessionWithWallets.mockResolvedValue(mockSession);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");

      const results = await obfuscationTxBuilder.buildAllFundingTransactions(
        1,
        sourceWallet
      );

      expect(results[0].walletIndex).toBe(0);
      expect(results[0].destinationAddress).toBe("11111111111111111111111111111111");
      expect(results[0].amount).toBe("400000000");
      // serialized should be a non-empty string
      expect(typeof results[0].serialized).toBe("string");
      expect(results[0].serialized.length).toBeGreaterThan(0);
    });

    it("should handle session with all wallets already funded", async () => {
      const allFundedSession = {
        ...mockSession,
        intermediateWallets: mockSession.intermediateWallets.map((w) => ({
          ...w,
          fundingStatus: "funded",
        })),
      };
      mockGetSessionWithWallets.mockResolvedValue(allFundedSession);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");

      const results = await obfuscationTxBuilder.buildAllFundingTransactions(
        1,
        sourceWallet
      );

      expect(results).toHaveLength(0);
    });

    it("guarantees each SOL-funded wallet gets at least minLamportsPerWallet", async () => {
      const tinySolSession = {
        ...mockSession,
        totalAmount: "10",
        intermediateWallets: [
          {
            ...mockSession.intermediateWallets[0],
            allocatedAmount: "1",
            fundingStatus: "pending",
          },
        ],
      };
      mockGetSessionWithWallets.mockResolvedValue(tinySolSession);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");
      await obfuscationTxBuilder.buildAllFundingTransactions(1, sourceWallet);

      const builtTx = mockSerialize.mock.calls[0]?.[0] as Transaction;
      const transferIx = builtTx.instructions.find((ix) =>
        ix.programId.equals(new PublicKey("11111111111111111111111111111111"))
      );

      expect(transferIx).toBeDefined();
      const decoded = SystemInstruction.decodeTransfer(transferIx!);
      expect(decoded.lamports).toBeGreaterThanOrEqual(1_075_880n);
    });
  });

  describe("buildAggregationTransaction", () => {
    it("should return null when session not found", async () => {
      mockGetSession.mockResolvedValue(null);

      const result = await obfuscationTxBuilder.buildAggregationTransaction(
        1,
        999
      );

      expect(result).toBeNull();
    });

    it("should return null when wallet X not found", async () => {
      mockGetSession.mockResolvedValue(mockSession);
      mockGetWalletX.mockResolvedValue(null);

      const result = await obfuscationTxBuilder.buildAggregationTransaction(
        1,
        1
      );

      expect(result).toBeNull();
    });

    it("should return null when intermediate wallet not found", async () => {
      mockGetSession.mockResolvedValue(mockSession);
      mockGetWalletX.mockResolvedValue(mockCustodialWallet);
      mockGetIntermediateWalletWithCustodial.mockResolvedValue(null);

      const result = await obfuscationTxBuilder.buildAggregationTransaction(
        999,
        1
      );

      expect(result).toBeNull();
    });

    it("should return null when signer keypair not found", async () => {
      mockGetSession.mockResolvedValue(mockSession);
      mockGetWalletX.mockResolvedValue(mockCustodialWallet);
      mockGetIntermediateWalletWithCustodial.mockResolvedValue(
        mockIntermediateWallet
      );
      mockGetKeypairForWallet.mockResolvedValue(null);

      const result = await obfuscationTxBuilder.buildAggregationTransaction(
        1,
        1
      );

      expect(result).toBeNull();
    });

    it("should return transaction and signer for SOL", async () => {
      const keypair = Keypair.generate();
      mockGetSession.mockResolvedValue(mockSession);
      mockGetWalletX.mockResolvedValue(mockCustodialWallet);
      mockGetIntermediateWalletWithCustodial.mockResolvedValue(
        mockIntermediateWallet
      );
      mockGetKeypairForWallet.mockResolvedValue(keypair);

      const result = await obfuscationTxBuilder.buildAggregationTransaction(
        1,
        1
      );

      expect(result).not.toBeNull();
      expect(result?.transaction).toBeInstanceOf(Transaction);
      expect(result?.signer).toBe(keypair);
    });
  });

  describe("buildCleanupTransaction", () => {
    it("should return null when session not found", async () => {
      mockGetSession.mockResolvedValue(null);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");

      const result = await obfuscationTxBuilder.buildCleanupTransaction(
        1,
        999,
        sourceWallet
      );

      expect(result).toBeNull();
    });

    it("should return null when signer keypair not found", async () => {
      mockGetSession.mockResolvedValue(mockSession);
      mockGetKeypairForWallet.mockResolvedValue(null);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");

      const result = await obfuscationTxBuilder.buildCleanupTransaction(
        999,
        1,
        sourceWallet
      );

      expect(result).toBeNull();
    });

    it("should return null when no dust to return", async () => {
      const keypair = Keypair.generate();
      mockGetSession.mockResolvedValue(mockSession);
      mockGetIntermediateWalletWithCustodial.mockResolvedValue(
        mockIntermediateWallet
      );
      mockGetKeypairForWallet.mockResolvedValue(keypair);
      mockGetBalance.mockResolvedValue(5000); // Only enough for fees

      const sourceWallet = new PublicKey("11111111111111111111111111111111");

      const result = await obfuscationTxBuilder.buildCleanupTransaction(
        1,
        1,
        sourceWallet
      );

      expect(result).toBeNull();
    });

    it("should return transaction when dust to return", async () => {
      const keypair = Keypair.generate();
      mockGetSession.mockResolvedValue(mockSession);
      mockGetIntermediateWalletWithCustodial.mockResolvedValue(
        mockIntermediateWallet
      );
      mockGetKeypairForWallet.mockResolvedValue(keypair);
      mockGetBalance.mockResolvedValue(1000000); // Has dust

      const sourceWallet = new PublicKey("11111111111111111111111111111111");

      const result = await obfuscationTxBuilder.buildCleanupTransaction(
        1,
        1,
        sourceWallet
      );

      expect(result).not.toBeNull();
      expect(result?.transaction).toBeInstanceOf(Transaction);
      expect(result?.signer).toBe(keypair);
    });
  });

  describe("buildWalletXCleanupTransaction", () => {
    it("should return null when session not found", async () => {
      mockGetSession.mockResolvedValue(null);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");

      const result = await obfuscationTxBuilder.buildWalletXCleanupTransaction(
        999,
        sourceWallet
      );

      expect(result).toBeNull();
    });

    it("should return null when wallet X keypair not found", async () => {
      mockGetSession.mockResolvedValue(mockSession);
      mockGetKeypair.mockResolvedValue(null);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");

      const result = await obfuscationTxBuilder.buildWalletXCleanupTransaction(
        1,
        sourceWallet
      );

      expect(result).toBeNull();
    });

    it("should return transaction when dust to return", async () => {
      const keypair = Keypair.generate();
      mockGetSession.mockResolvedValue(mockSession);
      mockGetKeypair.mockResolvedValue(keypair);
      mockGetBalance.mockResolvedValue(1000000);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");

      const result = await obfuscationTxBuilder.buildWalletXCleanupTransaction(
        1,
        sourceWallet
      );

      expect(result).not.toBeNull();
      expect(result?.transaction).toBeInstanceOf(Transaction);
      expect(result?.signer).toBe(keypair);
    });
  });

  describe("executeTransaction", () => {
    it("should sign, send and confirm transaction", async () => {
      const keypair = Keypair.generate();
      const transaction = new Transaction();

      // Setup blockhash for transaction
      transaction.recentBlockhash = "GpRvVHUxJqJcLwBsFBF8j8xNuAmMdAkPjVGJLu8LLNDB";
      transaction.feePayer = keypair.publicKey;

      const signature = await obfuscationTxBuilder.executeTransaction(
        transaction,
        keypair
      );

      expect(signature).toBe("mockSignature123");
      expect(mockSendRawTransaction).toHaveBeenCalled();
      expect(mockConfirmTransaction).toHaveBeenCalledWith(
        {
          signature: "mockSignature123",
          blockhash: "GpRvVHUxJqJcLwBsFBF8j8xNuAmMdAkPjVGJLu8LLNDB",
          lastValidBlockHeight: undefined,
        },
        "confirmed"
      );
    });

    it("should propagate sendRawTransaction failure", async () => {
      const keypair = Keypair.generate();
      const transaction = new Transaction();
      transaction.recentBlockhash = "GpRvVHUxJqJcLwBsFBF8j8xNuAmMdAkPjVGJLu8LLNDB";
      transaction.feePayer = keypair.publicKey;

      mockSendRawTransaction.mockRejectedValue(new Error("Blockhash not found"));

      await expect(
        obfuscationTxBuilder.executeTransaction(transaction, keypair)
      ).rejects.toThrow("Blockhash not found");
      expect(mockConfirmTransaction).not.toHaveBeenCalled();
    });

    it("should propagate confirmTransaction failure", async () => {
      const keypair = Keypair.generate();
      const transaction = new Transaction();
      transaction.recentBlockhash = "GpRvVHUxJqJcLwBsFBF8j8xNuAmMdAkPjVGJLu8LLNDB";
      transaction.feePayer = keypair.publicKey;

      mockConfirmTransaction.mockRejectedValue(new Error("Transaction expired: block height exceeded"));

      await expect(
        obfuscationTxBuilder.executeTransaction(transaction, keypair)
      ).rejects.toThrow("Transaction expired");
    });
  });

  describe("buildAggregationTransaction (SPL path)", () => {
    const splSession = {
      ...mockSession,
      tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tokenType: "SPL",
    };

    it("should create ATA for wallet X when it does not exist", async () => {
      const keypair = Keypair.generate();
      mockGetSession.mockResolvedValue(splSession);
      mockGetWalletX.mockResolvedValue(mockCustodialWallet);
      mockGetIntermediateWalletWithCustodial.mockResolvedValue(mockIntermediateWallet);
      mockGetKeypairForWallet.mockResolvedValue(keypair);
      mockGetAssociatedTokenAddress.mockResolvedValue(new PublicKey("11111111111111111111111111111111"));
      mockGetAccount.mockRejectedValue(new Error("Account not found")); // ATA doesn't exist

      const result = await obfuscationTxBuilder.buildAggregationTransaction(1, 1);

      expect(result).not.toBeNull();
      expect(result?.transaction).toBeInstanceOf(Transaction);
    });

    it("should skip ATA creation when wallet X ATA already exists", async () => {
      const keypair = Keypair.generate();
      mockGetSession.mockResolvedValue(splSession);
      mockGetWalletX.mockResolvedValue(mockCustodialWallet);
      mockGetIntermediateWalletWithCustodial.mockResolvedValue(mockIntermediateWallet);
      mockGetKeypairForWallet.mockResolvedValue(keypair);
      mockGetAssociatedTokenAddress.mockResolvedValue(new PublicKey("11111111111111111111111111111111"));
      mockGetAccount.mockResolvedValue({ amount: BigInt(0) }); // ATA exists

      const result = await obfuscationTxBuilder.buildAggregationTransaction(1, 1);

      expect(result).not.toBeNull();
      expect(result?.transaction).toBeInstanceOf(Transaction);
    });
  });

  describe("buildCleanupTransaction (SPL path)", () => {
    const splSession = {
      ...mockSession,
      tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tokenType: "SPL",
    };

    it("should close ATA when token balance is zero", async () => {
      const keypair = Keypair.generate();
      mockGetSession.mockResolvedValue(splSession);
      mockGetKeypairForWallet.mockResolvedValue(keypair);
      mockGetBalance.mockResolvedValue(5000000000);
      mockGetAssociatedTokenAddress.mockResolvedValue(new PublicKey("11111111111111111111111111111111"));
      mockGetAccount.mockResolvedValue({ amount: BigInt(0) }); // Empty ATA

      const sourceWallet = new PublicKey("11111111111111111111111111111111");
      const result = await obfuscationTxBuilder.buildCleanupTransaction(1, 1, sourceWallet);

      expect(result).not.toBeNull();
      expect(result?.transaction).toBeInstanceOf(Transaction);
    });

    it("should not close ATA when token balance is non-zero", async () => {
      const keypair = Keypair.generate();
      mockGetSession.mockResolvedValue(splSession);
      mockGetKeypairForWallet.mockResolvedValue(keypair);
      mockGetBalance.mockResolvedValue(5000000000);
      mockGetAssociatedTokenAddress.mockResolvedValue(new PublicKey("11111111111111111111111111111111"));
      mockGetAccount.mockResolvedValue({ amount: BigInt(1000) }); // ATA has tokens

      const sourceWallet = new PublicKey("11111111111111111111111111111111");
      const result = await obfuscationTxBuilder.buildCleanupTransaction(1, 1, sourceWallet);

      expect(result).not.toBeNull();
    });

    it("should handle missing ATA gracefully during cleanup", async () => {
      const keypair = Keypair.generate();
      mockGetSession.mockResolvedValue(splSession);
      mockGetKeypairForWallet.mockResolvedValue(keypair);
      mockGetBalance.mockResolvedValue(5000000000);
      mockGetAssociatedTokenAddress.mockResolvedValue(new PublicKey("11111111111111111111111111111111"));
      mockGetAccount.mockRejectedValue(new Error("Account does not exist")); // No ATA

      const sourceWallet = new PublicKey("11111111111111111111111111111111");
      const result = await obfuscationTxBuilder.buildCleanupTransaction(1, 1, sourceWallet);

      // Should still succeed - ATA close is skipped
      expect(result).not.toBeNull();
    });
  });

  describe("buildAllFundingTransactions (SPL path)", () => {
    it("should include ATA creation and SOL funding for SPL tokens", async () => {
      const splSession = {
        ...mockSession,
        tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        tokenType: "SPL",
      };
      mockGetSessionWithWallets.mockResolvedValue(splSession);
      mockGetAssociatedTokenAddress.mockResolvedValue(new PublicKey("11111111111111111111111111111111"));
      mockGetAccount.mockRejectedValue(new Error("Account not found")); // ATA doesn't exist

      const sourceWallet = new PublicKey("11111111111111111111111111111111");
      const results = await obfuscationTxBuilder.buildAllFundingTransactions(1, sourceWallet);

      expect(results.length).toBe(2); // 2 pending wallets
    });

    it("guarantees each SPL-funded wallet gets at least minLamportsPerWallet in SOL", async () => {
      const tinySplSession = {
        ...mockSession,
        tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        tokenType: "SPL",
        totalAmount: "10",
        intermediateWallets: [
          {
            ...mockSession.intermediateWallets[0],
            allocatedAmount: "1",
            fundingStatus: "pending",
          },
        ],
      };
      mockGetSessionWithWallets.mockResolvedValue(tinySplSession);
      mockGetAssociatedTokenAddress.mockResolvedValue(new PublicKey("11111111111111111111111111111111"));
      mockGetAccount.mockRejectedValue(new Error("Account not found"));

      const sourceWallet = new PublicKey("11111111111111111111111111111111");
      await obfuscationTxBuilder.buildAllFundingTransactions(1, sourceWallet);

      const builtTx = mockSerialize.mock.calls[0]?.[0] as Transaction;
      const transferIxs = builtTx.instructions.filter((ix) =>
        ix.programId.equals(new PublicKey("11111111111111111111111111111111"))
      );
      const solFundingIx = transferIxs.at(-1);

      expect(solFundingIx).toBeDefined();
      const decoded = SystemInstruction.decodeTransfer(solFundingIx!);
      expect(decoded.lamports).toBeGreaterThanOrEqual(1_075_880n);
    });
  });

  describe("buildCleanupTransaction (edge cases)", () => {
    it("should return null when balance is at boundary of exactTxFee", async () => {
      const keypair = Keypair.generate();
      mockGetSession.mockResolvedValue(mockSession);
      mockGetKeypairForWallet.mockResolvedValue(keypair);
      // Set balance to exactly the tx fee - should be too low
      mockGetBalance.mockResolvedValue(5000);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");
      const result = await obfuscationTxBuilder.buildCleanupTransaction(1, 1, sourceWallet);

      expect(result).toBeNull();
    });
  });

  describe("gas spike resilience", () => {
    // After aggregation at 1x fees, the intermediate wallet's remaining balance is:
    //   reserveForCleanup - aggTxFee
    // where reserveForCleanup = (aggFee + cleanupFee) + RENT_EXEMPT
    //
    // With recommendedPriorityFee = 50000 micro-lamports/CU:
    //   cleanupPriority = ceil(50000 * 50000 / 1e6) = 2500
    //   cleanupTxFee (exactTxFee) = 5000 + 2500 = 7500
    //   Cleanup skips when balance <= exactTxFee (7500)

    const POST_AGG_REMAINING_BALANCE = 905_880;

    it("should succeed at normal fees (post-aggregation remaining balance)", async () => {
      const keypair = Keypair.generate();
      mockGetSession.mockResolvedValue(mockSession);
      mockGetKeypairForWallet.mockResolvedValue(keypair);
      // Balance after aggregation at 1x fees
      mockGetBalance.mockResolvedValue(POST_AGG_REMAINING_BALANCE);
      // Normal priority fee (1x)
      mockGetRecommendedPriorityFee.mockResolvedValue(50_000);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");
      const result = await obfuscationTxBuilder.buildCleanupTransaction(1, 1, sourceWallet);

      // exactTxFee = 5000 + 2500 = 7500
      // 905880 > 7500 → cleanup proceeds
      expect(result).not.toBeNull();
      expect(result?.transaction).toBeInstanceOf(Transaction);
    });

    it("should succeed at 10x fee spike between aggregation and cleanup", async () => {
      const keypair = Keypair.generate();
      mockGetSession.mockResolvedValue(mockSession);
      mockGetKeypairForWallet.mockResolvedValue(keypair);
      // Balance was set at funding time with 1x fees
      mockGetBalance.mockResolvedValue(POST_AGG_REMAINING_BALANCE);
      // 10x fee spike at cleanup time
      mockGetRecommendedPriorityFee.mockResolvedValue(500_000);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");
      const result = await obfuscationTxBuilder.buildCleanupTransaction(1, 1, sourceWallet);

      // exactTxFee = 5000 + ceil(50000 * 500000 / 1e6) = 5000 + 25000 = 30000
      // 905880 > 30000 → cleanup still proceeds
      expect(result).not.toBeNull();
      expect(result?.transaction).toBeInstanceOf(Transaction);
    });

    it("should skip cleanup when balance is below exactTxFee", async () => {
      const keypair = Keypair.generate();
      mockGetSession.mockResolvedValue(mockSession);
      mockGetKeypairForWallet.mockResolvedValue(keypair);
      // Balance too low to cover tx fee
      mockGetBalance.mockResolvedValue(7_500);
      mockGetRecommendedPriorityFee.mockResolvedValue(50_000);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");
      const result = await obfuscationTxBuilder.buildCleanupTransaction(1, 1, sourceWallet);

      // exactTxFee = 5000 + 2500 = 7500
      // 7500 <= 7500 → cleanup skipped
      expect(result).toBeNull();
    });
  });

  describe("TOCTOU race condition prevention", () => {
    it("should call getRecommendedPriorityFee exactly once per cleanup call", async () => {
      const keypair = Keypair.generate();
      mockGetSession.mockResolvedValue(mockSession);
      mockGetKeypairForWallet.mockResolvedValue(keypair);
      mockGetBalance.mockResolvedValue(1_000_000);
      mockGetRecommendedPriorityFee.mockResolvedValue(50_000);

      const sourceWallet = new PublicKey("11111111111111111111111111111111");
      await obfuscationTxBuilder.buildCleanupTransaction(1, 1, sourceWallet);

      // The fee must be queried exactly once so the same value is used
      // for both the transfer amount calculation and the tx instructions.
      // A second query could return a different fee (TOCTOU race).
      expect(mockGetRecommendedPriorityFee).toHaveBeenCalledTimes(1);
    });
  });
});
