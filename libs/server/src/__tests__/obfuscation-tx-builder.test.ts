import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PublicKey, Keypair, Transaction } from "@solana/web3.js";

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
  getRecommendedPriorityFee: vi.fn().mockResolvedValue(50000),
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
    mockCreateDynamicPriorityInstructions.mockResolvedValue([]);
    mockSerialize.mockResolvedValue({
      transaction: "serializedTxBase64",
      blockhash: "GpRvVHUxJqJcLwBsFBF8j8xNuAmMdAkPjVGJLu8LLNDB",
    });
    mockSendRawTransaction.mockResolvedValue("mockSignature123");
    mockConfirmTransaction.mockResolvedValue({ value: { err: null } });
  });

  afterEach(() => {
    vi.resetAllMocks();
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

    it("should return null when intermediate wallet not found", async () => {
      mockGetSession.mockResolvedValue(mockSession);
      mockGetIntermediateWalletWithCustodial.mockResolvedValue(null);

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
        "mockSignature123",
        "confirmed"
      );
    });
  });
});
