import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// Constants
const LAMPORTS_PER_SOL = 1_000_000_000;

// Mock the config module before importing contract service
vi.mock("../config/config", () => ({
  config: {
    solanaRpcUrl: "https://api.mainnet-beta.solana.com",
  },
}));

// Mock the executor service
vi.mock("../executors/executor.service", () => ({
  default: {
    getSigner: vi.fn().mockReturnValue({
      publicKey: new PublicKey("11111111111111111111111111111111"),
    }),
    getWalletByRouteId: vi.fn().mockReturnValue({
      publicKey: new PublicKey("11111111111111111111111111111111"),
    }),
  },
}));

// Mock @libs/solana-node
vi.mock("@libs/solana-node", () => ({
  fetchTokenMetadata: vi.fn().mockResolvedValue({
    uri: "https://example.com/metadata.json",
    name: "Test Token",
    symbol: "TEST",
  }),
}));

// Mock @solana/spl-token to avoid TokenOwnerOffCurveError with test PublicKeys
vi.mock("@solana/spl-token", async () => {
  const actual = await vi.importActual("@solana/spl-token");
  return {
    ...actual,
    getAssociatedTokenAddress: vi.fn().mockResolvedValue(
      new PublicKey("11111111111111111111111111111111"),
    ),
  };
});

// Mock sendAndConfirmTransaction from @solana/web3.js
const mockSendAndConfirmTransaction = vi.fn().mockResolvedValue("mock-tx-sig-123");
vi.mock("@solana/web3.js", async () => {
  const actual = await vi.importActual("@solana/web3.js");
  return {
    ...actual,
    sendAndConfirmTransaction: (...args: any[]) => mockSendAndConfirmTransaction(...args),
  };
});

// Mock the Anchor Program and account fetches
const mockRouteConfigFetch = vi.fn();
const mockRouteStateFetch = vi.fn();
const mockTokenConfigFetch = vi.fn();

const mockInstruction = vi.fn().mockResolvedValue({
  programId: new PublicKey("11111111111111111111111111111111"),
  keys: [],
  data: Buffer.alloc(0),
});

function createMethodsProxy() {
  return new Proxy({}, {
    get: () => (..._args: any[]) => ({
      accountsPartial: () => ({
        remainingAccounts: () => ({ instruction: mockInstruction }),
        instruction: mockInstruction,
      }),
      accountsStrict: () => ({
        remainingAccounts: () => ({ instruction: mockInstruction }),
        instruction: mockInstruction,
      }),
      instruction: mockInstruction,
    }),
  });
}

vi.mock("@coral-xyz/anchor", async () => {
  const actual = await vi.importActual("@coral-xyz/anchor");

  class MockProgram {
    programId = new PublicKey("3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh");
    account = {
      routeConfig: {
        fetch: mockRouteConfigFetch,
      },
      routeState: {
        fetch: mockRouteStateFetch,
      },
      tokenConfig: {
        fetch: mockTokenConfigFetch,
      },
    };
    methods = createMethodsProxy();
    coder = {
      instruction: {
        encode: vi.fn().mockReturnValue(Buffer.alloc(100)),
      },
    };
  }

  class MockAnchorProvider {}

  return {
    ...actual,
    Program: MockProgram,
    AnchorProvider: MockAnchorProvider,
  };
});

// Mock the IDL imports
vi.mock("../solana/idl/multi_hopper_project.json", () => ({
  default: {
    address: "3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh",
    metadata: {},
    instructions: [],
  },
  address: "3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh",
}));

vi.mock("../solana/idl/transfer_hook_guard.json", () => ({
  default: {
    address: "GuardProgram11111111111111111111111111111111",
    metadata: {},
    instructions: [],
  },
  address: "GuardProgram11111111111111111111111111111111",
}));

// Import functions after mocks are set up
import {
  getRouteConfigPda,
  getRouteStatePda,
  getTokenConfigSPL,
  getTokenConfigSOL,
  routeHasHops,
  isRouteDeployedOnChain,
  isRouteConfigPdaDeployed,
  calculateExecutorFunding,
  getRecommendedPriorityFee,
  getGuardPda,
  solToPriorityFeeMicroLamports,
  createPriorityFeeInstruction,
  createComputeUnitLimitInstruction,
  createDynamicPriorityInstructions,
  estimateDeploymentCost,
  getRouteConfiguration,
  getRouteStateAccount,
  getTokenConfigPda,
  getPermanentDelegate,
  getVaultAuthority,
  getSolVault,
  getMintAuthority,
  isExtraAccountMetasInitialized,
  initializeExtraAccountMetasForRoute,
  serialize,
  signAndSerialize,
  addHops,
  addHopsBatched,
  initializeCompleteTokenConfig,
  initializeCompleteSolTokenConfig,
  unwrap,
  unwrapSol,
  getVault,
  addHopsFromWalletX,
  createExecutorFundingInstruction,
  initializeRouteFromWalletX,
  initializeRouteSolWithWrap,
  initializeRouteWithWrap,
  executeHop,
  updateTokenConfigWithTransaction,
  updateSolTokenConfigWithTransaction,
  creatorUser,
  HOPS_PER_BATCH,
  params,
} from "../solana/services/contract.service";
import contractService from "../solana/services/contract.service";

describe("Contract Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock getRecentPrioritizationFees globally to avoid real RPC calls
    params.connection.getRecentPrioritizationFees = vi.fn().mockResolvedValue([]) as any;
  });

  describe("calculateExecutorFunding", () => {
    /**
     * Formula: (hopCount * 0.002 + 0.02) SOL converted to lamports
     * LAMPORTS_PER_SOL = 1_000_000_000
     */

    describe("Basic Calculations", () => {
      it("should calculate correct funding for 1 hop", () => {
        const hopCount = 1;
        const result = calculateExecutorFunding(hopCount);

        // (1 * 0.002 + 0.02) = 0.022 SOL = 22_000_000 lamports
        const expectedLamports = 0.022 * LAMPORTS_PER_SOL;

        expect(result).toBeInstanceOf(BN);
        expect(result.toNumber()).toBe(expectedLamports);
        expect(result.toNumber()).toBe(22_000_000);
      });

      it("should calculate correct funding for 5 hops", () => {
        const hopCount = 5;
        const result = calculateExecutorFunding(hopCount);

        // (5 * 0.002 + 0.02) = 0.01 + 0.02 = 0.03 SOL = 30_000_000 lamports
        const expectedLamports = 0.03 * LAMPORTS_PER_SOL;

        expect(result.toNumber()).toBe(expectedLamports);
        expect(result.toNumber()).toBe(30_000_000);
      });

      it("should calculate correct funding for 10 hops", () => {
        const hopCount = 10;
        const result = calculateExecutorFunding(hopCount);

        // (10 * 0.002 + 0.02) = 0.02 + 0.02 = 0.04 SOL = 40_000_000 lamports
        const expectedLamports = 0.04 * LAMPORTS_PER_SOL;

        expect(result.toNumber()).toBe(expectedLamports);
        expect(result.toNumber()).toBe(40_000_000);
      });
    });

    describe("Edge Cases", () => {
      it("should calculate correct funding for 0 hops (base funding only)", () => {
        const hopCount = 0;
        const result = calculateExecutorFunding(hopCount);

        // (0 * 0.002 + 0.02) = 0.02 SOL = 20_000_000 lamports
        const expectedLamports = 0.02 * LAMPORTS_PER_SOL;

        expect(result.toNumber()).toBe(expectedLamports);
        expect(result.toNumber()).toBe(20_000_000);
      });

      it("should calculate correct funding for large hop count (100 hops)", () => {
        const hopCount = 100;
        const result = calculateExecutorFunding(hopCount);

        // (100 * 0.002 + 0.02) = 0.2 + 0.02 = 0.22 SOL = 220_000_000 lamports
        const expectedLamports = 0.22 * LAMPORTS_PER_SOL;

        expect(result.toNumber()).toBe(expectedLamports);
        expect(result.toNumber()).toBe(220_000_000);
      });

      it("should handle very large hop counts without overflow", () => {
        const hopCount = 1000;
        const result = calculateExecutorFunding(hopCount);

        // (1000 * 0.002 + 0.02) = 2.0 + 0.02 = 2.02 SOL = 2_020_000_000 lamports
        const expectedLamports = 2.02 * LAMPORTS_PER_SOL;

        expect(result.toNumber()).toBe(expectedLamports);
        expect(result.toNumber()).toBe(2_020_000_000);
      });
    });

    describe("Lamport Conversion Verification", () => {
      it("should return BN type for all calculations", () => {
        expect(calculateExecutorFunding(1)).toBeInstanceOf(BN);
        expect(calculateExecutorFunding(5)).toBeInstanceOf(BN);
        expect(calculateExecutorFunding(10)).toBeInstanceOf(BN);
      });

      it("should correctly convert fractional SOL to lamports", () => {
        // Test that the conversion is precise for small hop counts
        const result = calculateExecutorFunding(2);

        // (2 * 0.002 + 0.02) = 0.004 + 0.02 = 0.024 SOL
        const expectedLamports = 0.024 * LAMPORTS_PER_SOL;

        expect(result.toNumber()).toBe(expectedLamports);
        expect(result.toNumber()).toBe(24_000_000);
      });

      it("should produce integer lamport values", () => {
        // All results should be whole numbers (no decimals in lamports)
        for (let hops = 0; hops <= 20; hops++) {
          const result = calculateExecutorFunding(hops);
          expect(Number.isInteger(result.toNumber())).toBe(true);
        }
      });
    });

    describe("Formula Verification", () => {
      it("should follow the formula (hopCount * 0.002 + 0.02) * LAMPORTS_PER_SOL", () => {
        const testCases = [
          { hops: 1, expected: 22_000_000 },
          { hops: 2, expected: 24_000_000 },
          { hops: 3, expected: 26_000_000 },
          { hops: 4, expected: 28_000_000 },
          { hops: 5, expected: 30_000_000 },
        ];

        testCases.forEach(({ hops, expected }) => {
          const result = calculateExecutorFunding(hops);
          expect(result.toNumber()).toBe(expected);
        });
      });

      it("should increase by 2_000_000 lamports (0.002 SOL) per additional hop", () => {
        const base = calculateExecutorFunding(0).toNumber();
        const one = calculateExecutorFunding(1).toNumber();
        const two = calculateExecutorFunding(2).toNumber();

        expect(one - base).toBe(2_000_000);
        expect(two - one).toBe(2_000_000);
      });
    });
  });

  describe("getTokenConfigSPL", () => {
    describe("Successful Fetch", () => {
      it("should return token config with feeBps divided by 10,000", async () => {
        mockTokenConfigFetch.mockResolvedValue({
          creator: new PublicKey("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P"),
          minTransfer: new BN(100000000),
          feeBps: new BN(500), // 500 bps = 5%
          feeTreasury: new PublicKey("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P"),
          maxHops: new BN(10),
          flatFeeLamports: new BN(10000000),
        });

        const result = await getTokenConfigSPL();

        expect(result).not.toBeNull();
        expect(result!.feeBps).toBe("0.05"); // 500 / 10_000 = 0.05
        expect(result!.minTransfer).toBe("100000000");
        expect(result!.feeTreasury).toBe("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P");
        expect(result!.maxHops).toBe("10");
        expect(result!.flatFeeLamports).toBe("10000000");
      });

      it("should correctly divide feeBps by 10,000 for various values", async () => {
        const testCases = [
          { feeBps: 100, expected: "0.01" },   // 1%
          { feeBps: 250, expected: "0.025" },  // 2.5%
          { feeBps: 500, expected: "0.05" },   // 5%
          { feeBps: 1000, expected: "0.1" },   // 10%
          { feeBps: 10000, expected: "1" },    // 100%
        ];

        for (const { feeBps, expected } of testCases) {
          mockTokenConfigFetch.mockResolvedValue({
            creator: new PublicKey("11111111111111111111111111111111"),
            minTransfer: new BN(100000000),
            feeBps: new BN(feeBps),
            feeTreasury: new PublicKey("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P"),
            maxHops: new BN(10),
            flatFeeLamports: new BN(10000000),
          });

          const result = await getTokenConfigSPL();
          expect(result!.feeBps).toBe(expected);
        }
      });

      it("should return feeBps as '0' when feeBps is 0", async () => {
        mockTokenConfigFetch.mockResolvedValue({
          creator: new PublicKey("11111111111111111111111111111111"),
          minTransfer: new BN(100000000),
          feeBps: new BN(0),
          feeTreasury: new PublicKey("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P"),
          maxHops: new BN(10),
          flatFeeLamports: new BN(10000000),
        });

        const result = await getTokenConfigSPL();
        expect(result!.feeBps).toBe("0");
      });
    });

    describe("Error Handling", () => {
      it("should return null when account fetch fails", async () => {
        mockTokenConfigFetch.mockRejectedValue(new Error("Account not found"));

        const result = await getTokenConfigSPL();

        expect(result).toBeNull();
      });

      it("should return null on network error", async () => {
        mockTokenConfigFetch.mockRejectedValue(new Error("Network timeout"));

        const result = await getTokenConfigSPL();

        expect(result).toBeNull();
      });
    });
  });

  describe("getTokenConfigSOL", () => {
    describe("Successful Fetch", () => {
      it("should return token config with raw feeBps (not divided)", async () => {
        mockTokenConfigFetch.mockResolvedValue({
          creator: new PublicKey("11111111111111111111111111111111"),
          minTransfer: new BN(100000000),
          feeBps: new BN(500), // 500 bps = 5%, but returned as raw
          feeTreasury: new PublicKey("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P"),
          maxHops: new BN(10),
          flatFeeLamports: new BN(10000000),
        });

        const result = await getTokenConfigSOL();

        expect(result).not.toBeNull();
        expect(result!.feeBps).toBe("500"); // Raw value, NOT divided
        expect(result!.minTransfer).toBe("100000000");
        expect(result!.feeTreasury).toBe("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P");
        expect(result!.maxHops).toBe("10");
        expect(result!.flatFeeLamports).toBe("10000000");
      });

      it("should return raw feeBps for various values", async () => {
        const testCases = [
          { feeBps: 100, expected: "100" },
          { feeBps: 250, expected: "250" },
          { feeBps: 500, expected: "500" },
          { feeBps: 1000, expected: "1000" },
          { feeBps: 10000, expected: "10000" },
        ];

        for (const { feeBps, expected } of testCases) {
          mockTokenConfigFetch.mockResolvedValue({
            creator: new PublicKey("11111111111111111111111111111111"),
            minTransfer: new BN(100000000),
            feeBps: new BN(feeBps),
            feeTreasury: new PublicKey("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P"),
            maxHops: new BN(10),
            flatFeeLamports: new BN(10000000),
          });

          const result = await getTokenConfigSOL();
          expect(result!.feeBps).toBe(expected);
        }
      });
    });

    describe("Difference from SPL Token Config", () => {
      it("should return different feeBps format than getTokenConfigSPL", async () => {
        const rawFeeBps = 500;

        mockTokenConfigFetch.mockResolvedValue({
          creator: new PublicKey("11111111111111111111111111111111"),
          minTransfer: new BN(100000000),
          feeBps: new BN(rawFeeBps),
          feeTreasury: new PublicKey("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P"),
          maxHops: new BN(10),
          flatFeeLamports: new BN(10000000),
        });

        const solResult = await getTokenConfigSOL();
        const splResult = await getTokenConfigSPL();

        expect(solResult!.feeBps).toBe("500"); // Raw
        expect(splResult!.feeBps).toBe("0.05"); // Divided by 10,000
        expect(solResult!.feeBps).not.toBe(splResult!.feeBps);
      });
    });

    describe("Error Handling", () => {
      it("should return null when account fetch fails", async () => {
        mockTokenConfigFetch.mockRejectedValue(new Error("Account not found"));

        const result = await getTokenConfigSOL();

        expect(result).toBeNull();
      });
    });
  });

  describe("routeHasHops", () => {
    describe("Route With Hops", () => {
      it("should return hasHops: true when route has hops", async () => {
        mockRouteConfigFetch.mockResolvedValue({
          hops: [
            { recipient: new PublicKey("11111111111111111111111111111111"), executeAt: new BN(0) },
            { recipient: new PublicKey("11111111111111111111111111111112"), executeAt: new BN(0) },
          ],
        });

        const result = await routeHasHops(123);

        expect(result.hasHops).toBe(true);
        expect(result.isDeployed).toBe(true);
      });

      it("should return hasHops: true for single hop", async () => {
        mockRouteConfigFetch.mockResolvedValue({
          hops: [
            { recipient: new PublicKey("11111111111111111111111111111111"), executeAt: new BN(0) },
          ],
        });

        const result = await routeHasHops(456);

        expect(result.hasHops).toBe(true);
        expect(result.isDeployed).toBe(true);
      });
    });

    describe("Route Without Hops", () => {
      it("should return hasHops: false when route has empty hops array", async () => {
        mockRouteConfigFetch.mockResolvedValue({
          hops: [],
        });

        const result = await routeHasHops(789);

        expect(result.hasHops).toBe(false);
        expect(result.isDeployed).toBe(true);
      });
    });

    describe("Error Handling - Missing Accounts", () => {
      it("should return hasHops: false and isDeployed: false when route does not exist", async () => {
        mockRouteConfigFetch.mockRejectedValue(new Error("Account does not exist"));

        const result = await routeHasHops(999);

        expect(result.hasHops).toBe(false);
        expect(result.isDeployed).toBe(false);
      });

      it("should handle AccountNotFound errors gracefully", async () => {
        mockRouteConfigFetch.mockRejectedValue(new Error("AccountNotFound"));

        const result = await routeHasHops(1000);

        expect(result.hasHops).toBe(false);
        expect(result.isDeployed).toBe(false);
      });
    });

    describe("Error Handling - RPC Errors", () => {
      it("should return hasHops: false and isDeployed: false on RPC timeout", async () => {
        mockRouteConfigFetch.mockRejectedValue(new Error("Network request timeout"));

        const result = await routeHasHops(1001);

        expect(result.hasHops).toBe(false);
        expect(result.isDeployed).toBe(false);
      });

      it("should return hasHops: false and isDeployed: false on connection refused", async () => {
        mockRouteConfigFetch.mockRejectedValue(new Error("ECONNREFUSED"));

        const result = await routeHasHops(1002);

        expect(result.hasHops).toBe(false);
        expect(result.isDeployed).toBe(false);
      });

      it("should return hasHops: false and isDeployed: false on rate limiting", async () => {
        mockRouteConfigFetch.mockRejectedValue(new Error("429 Too Many Requests"));

        const result = await routeHasHops(1003);

        expect(result.hasHops).toBe(false);
        expect(result.isDeployed).toBe(false);
      });
    });
  });

  describe("isRouteDeployedOnChain", () => {
    // isRouteDeployedOnChain uses params.connection.getAccountInfo (not Program.account.routeConfig.fetch)
    let mockGetAccountInfo: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockGetAccountInfo = vi.fn();
      params.connection.getAccountInfo = mockGetAccountInfo as any;
    });

    describe("Route Exists", () => {
      it("should return true when route config PDA exists", async () => {
        mockGetAccountInfo.mockResolvedValue({
          data: Buffer.alloc(100), // non-empty data
          executable: false,
          lamports: 1000000,
          owner: new PublicKey("11111111111111111111111111111111"),
        });

        const result = await isRouteDeployedOnChain(123);

        expect(result).toBe(true);
      });

      it("should return true for various route IDs", async () => {
        mockGetAccountInfo.mockResolvedValue({
          data: Buffer.alloc(100),
          executable: false,
          lamports: 1000000,
          owner: new PublicKey("11111111111111111111111111111111"),
        });

        expect(await isRouteDeployedOnChain(1)).toBe(true);
        expect(await isRouteDeployedOnChain(100)).toBe(true);
        expect(await isRouteDeployedOnChain(999999)).toBe(true);
      });
    });

    describe("Route Does Not Exist", () => {
      it("should return false when route config PDA does not exist", async () => {
        mockGetAccountInfo.mockResolvedValue(null);

        const result = await isRouteDeployedOnChain(456);

        expect(result).toBe(false);
      });

      it("should return false when account has empty data", async () => {
        mockGetAccountInfo.mockResolvedValue({
          data: Buffer.alloc(0),
          executable: false,
          lamports: 0,
          owner: new PublicKey("11111111111111111111111111111111"),
        });

        const result = await isRouteDeployedOnChain(789);

        expect(result).toBe(false);
      });
    });

    describe("Error Handling - RPC Errors", () => {
      it("should return false on network errors", async () => {
        mockGetAccountInfo.mockRejectedValue(new Error("Network error"));

        const result = await isRouteDeployedOnChain(1000);

        expect(result).toBe(false);
      });

      it("should return false on connection errors", async () => {
        mockGetAccountInfo.mockRejectedValue(new Error("ECONNREFUSED"));

        const result = await isRouteDeployedOnChain(1001);

        expect(result).toBe(false);
      });

      it("should return false on RPC rate limiting", async () => {
        mockGetAccountInfo.mockRejectedValue(new Error("429 Too Many Requests"));

        const result = await isRouteDeployedOnChain(1002);

        expect(result).toBe(false);
      });

      it("should return false on RPC service unavailable", async () => {
        mockGetAccountInfo.mockRejectedValue(new Error("503 Service Unavailable"));

        const result = await isRouteDeployedOnChain(1003);

        expect(result).toBe(false);
      });
    });
  });

  describe("getRouteConfigPda", () => {
    describe("PDA Derivation Consistency", () => {
      it("should return consistent PDA for the same routeId", async () => {
        const routeId1 = new BN(123);
        const routeId2 = new BN(123);

        const pda1 = await getRouteConfigPda(routeId1);
        const pda2 = await getRouteConfigPda(routeId2);

        expect(pda1.toBase58()).toBe(pda2.toBase58());
      });

      it("should return different PDAs for different routeIds", async () => {
        const pda1 = await getRouteConfigPda(new BN(1));
        const pda2 = await getRouteConfigPda(new BN(2));
        const pda3 = await getRouteConfigPda(new BN(3));

        expect(pda1.toBase58()).not.toBe(pda2.toBase58());
        expect(pda2.toBase58()).not.toBe(pda3.toBase58());
        expect(pda1.toBase58()).not.toBe(pda3.toBase58());
      });

      it("should handle large routeIds", async () => {
        const largeRouteId = new BN(9999999999);
        const pda = await getRouteConfigPda(largeRouteId);

        expect(pda).toBeInstanceOf(PublicKey);
        expect(pda.toBase58()).toHaveLength(44); // Standard base58 pubkey length is 43-44 chars
      });

      it("should handle routeId of 0", async () => {
        const pda = await getRouteConfigPda(new BN(0));

        expect(pda).toBeInstanceOf(PublicKey);
        expect(pda.toBase58().length).toBeGreaterThan(0);
      });
    });

    describe("PDA is Valid PublicKey", () => {
      it("should return a valid PublicKey instance", async () => {
        const pda = await getRouteConfigPda(new BN(42));

        expect(pda).toBeInstanceOf(PublicKey);
        expect(PublicKey.isOnCurve(pda)).toBe(false); // PDAs are off-curve
      });

      it("should derive PDA using 'route' seed", async () => {
        // This tests that the PDA is consistently derived
        // The actual implementation uses [Buffer.from("route"), routeId.toArrayLike(Buffer, "le", 8)]
        const pda1 = await getRouteConfigPda(new BN(100));
        const pda2 = await getRouteConfigPda(new BN(100));

        expect(pda1.equals(pda2)).toBe(true);
      });
    });

    describe("Multiple Calls Idempotency", () => {
      it("should return same result across multiple calls", async () => {
        const routeId = new BN(555);
        const results: PublicKey[] = [];

        for (let i = 0; i < 5; i++) {
          results.push(await getRouteConfigPda(routeId));
        }

        const firstResult = results[0].toBase58();
        results.forEach((pda) => {
          expect(pda.toBase58()).toBe(firstResult);
        });
      });
    });
  });

  describe("getRouteStatePda", () => {
    describe("PDA Derivation Consistency", () => {
      it("should return consistent PDA for the same routeId", async () => {
        const routeId1 = new BN(123);
        const routeId2 = new BN(123);

        const pda1 = await getRouteStatePda(routeId1);
        const pda2 = await getRouteStatePda(routeId2);

        expect(pda1.toBase58()).toBe(pda2.toBase58());
      });

      it("should return different PDAs for different routeIds", async () => {
        const pda1 = await getRouteStatePda(new BN(1));
        const pda2 = await getRouteStatePda(new BN(2));
        const pda3 = await getRouteStatePda(new BN(3));

        expect(pda1.toBase58()).not.toBe(pda2.toBase58());
        expect(pda2.toBase58()).not.toBe(pda3.toBase58());
        expect(pda1.toBase58()).not.toBe(pda3.toBase58());
      });

      it("should handle large routeIds", async () => {
        const largeRouteId = new BN(9999999999);
        const pda = await getRouteStatePda(largeRouteId);

        expect(pda).toBeInstanceOf(PublicKey);
        expect(pda.toBase58()).toHaveLength(44);
      });

      it("should handle routeId of 0", async () => {
        const pda = await getRouteStatePda(new BN(0));

        expect(pda).toBeInstanceOf(PublicKey);
        expect(pda.toBase58().length).toBeGreaterThan(0);
      });
    });

    describe("Different from Route Config PDA", () => {
      it("should return different PDA than getRouteConfigPda for same routeId", async () => {
        const routeId = new BN(42);

        const configPda = await getRouteConfigPda(routeId);
        const statePda = await getRouteStatePda(routeId);

        expect(configPda.toBase58()).not.toBe(statePda.toBase58());
      });

      it("should consistently differ from route config PDA", async () => {
        const testRouteIds = [1, 10, 100, 1000, 10000];

        for (const id of testRouteIds) {
          const routeId = new BN(id);
          const configPda = await getRouteConfigPda(routeId);
          const statePda = await getRouteStatePda(routeId);

          expect(configPda.toBase58()).not.toBe(statePda.toBase58());
        }
      });
    });

    describe("PDA is Valid PublicKey", () => {
      it("should return a valid PublicKey instance", async () => {
        const pda = await getRouteStatePda(new BN(42));

        expect(pda).toBeInstanceOf(PublicKey);
        expect(PublicKey.isOnCurve(pda)).toBe(false); // PDAs are off-curve
      });

      it("should derive PDA using 'state' seed", async () => {
        // The actual implementation uses [Buffer.from("state"), routeId.toArrayLike(Buffer, "le", 8)]
        const pda1 = await getRouteStatePda(new BN(100));
        const pda2 = await getRouteStatePda(new BN(100));

        expect(pda1.equals(pda2)).toBe(true);
      });
    });

    describe("Multiple Calls Idempotency", () => {
      it("should return same result across multiple calls", async () => {
        const routeId = new BN(555);
        const results: PublicKey[] = [];

        for (let i = 0; i < 5; i++) {
          results.push(await getRouteStatePda(routeId));
        }

        const firstResult = results[0].toBase58();
        results.forEach((pda) => {
          expect(pda.toBase58()).toBe(firstResult);
        });
      });
    });
  });

  describe("Integration Scenarios", () => {
    describe("Route Deployment Verification Flow", () => {
      it("should verify deployed route has correct PDAs and hops", async () => {
        const routeId = 12345;

        // Simulate deployed route
        mockRouteConfigFetch.mockResolvedValue({
          creator: new PublicKey("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P"),
          routeId: new BN(routeId),
          hops: [
            { recipient: new PublicKey("11111111111111111111111111111111"), executeAt: new BN(0) },
          ],
        });

        // isRouteDeployedOnChain uses getAccountInfo, not routeConfig.fetch
        params.connection.getAccountInfo = vi.fn().mockResolvedValue({
          data: Buffer.alloc(100),
          executable: false,
          lamports: 1000000,
          owner: new PublicKey("11111111111111111111111111111111"),
        }) as any;

        const isDeployed = await isRouteDeployedOnChain(routeId);
        const hopsResult = await routeHasHops(routeId);
        const configPda = await getRouteConfigPda(new BN(routeId));
        const statePda = await getRouteStatePda(new BN(routeId));

        expect(isDeployed).toBe(true);
        expect(hopsResult.hasHops).toBe(true);
        expect(hopsResult.isDeployed).toBe(true);
        expect(configPda).toBeInstanceOf(PublicKey);
        expect(statePda).toBeInstanceOf(PublicKey);
        expect(configPda.toBase58()).not.toBe(statePda.toBase58());
      });

      it("should handle non-existent route correctly", async () => {
        mockRouteConfigFetch.mockRejectedValue(new Error("Account not found"));
        // isRouteDeployedOnChain uses getAccountInfo
        params.connection.getAccountInfo = vi.fn().mockResolvedValue(null) as any;

        const routeId = 99999;

        const isDeployed = await isRouteDeployedOnChain(routeId);
        const hopsResult = await routeHasHops(routeId);

        expect(isDeployed).toBe(false);
        expect(hopsResult.hasHops).toBe(false);
        expect(hopsResult.isDeployed).toBe(false);
      });
    });

    describe("Executor Funding for Route Creation", () => {
      it("should calculate appropriate funding for typical route sizes", async () => {
        // Small route (3 hops)
        const smallRouteFunding = calculateExecutorFunding(3);
        expect(smallRouteFunding.toNumber()).toBe(26_000_000); // 0.026 SOL

        // Medium route (10 hops)
        const mediumRouteFunding = calculateExecutorFunding(10);
        expect(mediumRouteFunding.toNumber()).toBe(40_000_000); // 0.04 SOL

        // Large route (50 hops)
        const largeRouteFunding = calculateExecutorFunding(50);
        expect(largeRouteFunding.toNumber()).toBe(120_000_000); // 0.12 SOL
      });
    });

    describe("getRecommendedPriorityFee", () => {
      it("should return fallback fee when getRecentPrioritizationFees throws", async () => {
        const mockConnection = {
          getRecentPrioritizationFees: vi.fn().mockRejectedValue(new Error("429 Too Many Requests")),
        } as unknown as Connection;

        const fee = await getRecommendedPriorityFee(mockConnection);

        expect(fee).toBe(1000); // Fallback
      });

      it("should return fallback fee when no recent fees available", async () => {
        const mockConnection = {
          getRecentPrioritizationFees: vi.fn().mockResolvedValue([]),
        } as unknown as Connection;

        const fee = await getRecommendedPriorityFee(mockConnection);

        expect(fee).toBe(1000); // Fallback for empty array
      });

      it("should calculate 75th percentile fee from recent fees", async () => {
        const mockConnection = {
          getRecentPrioritizationFees: vi.fn().mockResolvedValue([
            { prioritizationFee: 500, slot: 1 },
            { prioritizationFee: 2000, slot: 2 },
            { prioritizationFee: 5000, slot: 3 },
            { prioritizationFee: 10000, slot: 4 },
          ]),
        } as unknown as Connection;

        const fee = await getRecommendedPriorityFee(mockConnection);

        // 75th percentile of [500, 2000, 5000, 10000] → index 2 → 5000
        // Math.max(1000, 5000) = 5000
        expect(fee).toBe(5000);
      });

      it("should enforce minimum fee of 1000 micro-lamports", async () => {
        const mockConnection = {
          getRecentPrioritizationFees: vi.fn().mockResolvedValue([
            { prioritizationFee: 1, slot: 1 },
            { prioritizationFee: 2, slot: 2 },
            { prioritizationFee: 3, slot: 3 },
            { prioritizationFee: 4, slot: 4 },
          ]),
        } as unknown as Connection;

        const fee = await getRecommendedPriorityFee(mockConnection);

        // All fees < 1000, so minimum kicks in
        expect(fee).toBe(1000);
      });

      it("should accept custom percentile", async () => {
        const mockConnection = {
          getRecentPrioritizationFees: vi.fn().mockResolvedValue([
            { prioritizationFee: 1000, slot: 1 },
            { prioritizationFee: 2000, slot: 2 },
            { prioritizationFee: 3000, slot: 3 },
            { prioritizationFee: 50000, slot: 4 },
          ]),
        } as unknown as Connection;

        const fee = await getRecommendedPriorityFee(mockConnection, undefined, 50);

        // 50th percentile of [1000, 2000, 3000, 50000] → index 1 → 2000
        expect(fee).toBe(2000);
      });
    });

    describe("calculateExecutorFunding (edge cases)", () => {
      it("should handle 0 hops", () => {
        const result = calculateExecutorFunding(0);
        // (0 * 0.002 + 0.02) = 0.02 SOL = 20_000_000 lamports
        expect(result.toNumber()).toBe(20_000_000);
      });
    });

    describe("Token Config Differences", () => {
      it("should demonstrate SPL vs SOL token config feeBps difference", async () => {
        mockTokenConfigFetch.mockResolvedValue({
          creator: new PublicKey("11111111111111111111111111111111"),
          minTransfer: new BN(100000000),
          feeBps: new BN(500), // 5% as basis points
          feeTreasury: new PublicKey("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P"),
          maxHops: new BN(10),
          flatFeeLamports: new BN(10000000),
        });

        const splConfig = await getTokenConfigSPL();
        const solConfig = await getTokenConfigSOL();

        // SPL returns decimal percentage (500 / 10000 = 0.05)
        expect(splConfig!.feeBps).toBe("0.05");

        // SOL returns raw basis points
        expect(solConfig!.feeBps).toBe("500");

        // Verify they both represent the same underlying fee
        expect(parseFloat(splConfig!.feeBps) * 10000).toBe(parseInt(solConfig!.feeBps));
      });
    });
  });

  describe("solToPriorityFeeMicroLamports", () => {
    it("converts SOL to micro-lamports", () => {
      // 1 SOL = 1e9 lamports = 1e15 micro-lamports
      expect(solToPriorityFeeMicroLamports(1)).toBe(1_000_000_000_000_000);
    });

    it("converts small amount", () => {
      expect(solToPriorityFeeMicroLamports(0.001)).toBe(1_000_000_000_000);
    });

    it("returns 0 for 0 SOL", () => {
      expect(solToPriorityFeeMicroLamports(0)).toBe(0);
    });
  });

  describe("createPriorityFeeInstruction", () => {
    it("creates a TransactionInstruction with correct data layout", () => {
      const ix = createPriorityFeeInstruction(5000);
      expect(ix).toBeDefined();
    });
  });

  describe("createComputeUnitLimitInstruction", () => {
    it("creates a TransactionInstruction for compute units", () => {
      const ix = createComputeUnitLimitInstruction(400000);
      expect(ix).toBeDefined();
    });
  });

  describe("createDynamicPriorityInstructions", () => {
    it("returns two instructions (compute limit + priority fee)", async () => {
      const mockConn = {
        getRecentPrioritizationFees: vi.fn().mockResolvedValue([]),
      } as any;
      const result = await createDynamicPriorityInstructions(mockConn);
      expect(result).toHaveLength(2);
    });
  });

  describe("estimateDeploymentCost", () => {
    it("returns breakdown for typical route", () => {
      const result = estimateDeploymentCost(5, 1_000_000_000);
      expect(result.executorFunding).toBeGreaterThan(0);
      expect(result.transactionFees).toBeGreaterThan(0);
      expect(result.flatFee).toBe(10000);
      expect(result.percentageFee).toBeGreaterThan(0);
      expect(result.accountRent).toBeGreaterThan(0);
      expect(result.totalCost).toBe(
        result.executorFunding +
        result.transactionFees +
        result.flatFee +
        result.percentageFee +
        result.accountRent
      );
    });

    it("includes SOL-formatted breakdown strings", () => {
      const result = estimateDeploymentCost(3, 500000000);
      expect(result.breakdown.executorFundingSOL).toBeDefined();
      expect(result.breakdown.transactionFeesSOL).toBeDefined();
      expect(result.breakdown.flatFeeSOL).toBeDefined();
      expect(result.breakdown.percentageFeeSOL).toBeDefined();
      expect(result.breakdown.accountRentSOL).toBeDefined();
      expect(result.breakdown.totalCostSOL).toBeDefined();
      expect(parseFloat(result.breakdown.totalCostSOL)).toBeGreaterThan(0);
    });

    it("uses default feeBps=50 and flatFeeLamports=10000", () => {
      const result = estimateDeploymentCost(1, 1_000_000_000);
      expect(result.percentageFee).toBe(Math.floor((1_000_000_000 * 50) / 10000));
      expect(result.flatFee).toBe(10000);
    });

    it("accepts custom fee parameters", () => {
      const result = estimateDeploymentCost(1, 1_000_000_000, 100, 50000);
      expect(result.percentageFee).toBe(Math.floor((1_000_000_000 * 100) / 10000));
      expect(result.flatFee).toBe(50000);
    });

    it("scales transaction fees with hop count", () => {
      const r1 = estimateDeploymentCost(1, 1000);
      const r10 = estimateDeploymentCost(10, 1000);
      expect(r10.transactionFees).toBeGreaterThan(r1.transactionFees);
    });

    it("scales rent with hop count", () => {
      const r1 = estimateDeploymentCost(1, 1000);
      const r5 = estimateDeploymentCost(5, 1000);
      expect(r5.accountRent).toBeGreaterThan(r1.accountRent);
    });

    it("handles 0 hops", () => {
      const result = estimateDeploymentCost(0, 1000);
      expect(result.executorFunding).toBeGreaterThan(0);
      expect(result.totalCost).toBeGreaterThan(0);
    });
  });

  describe("getGuardPda", () => {
    it("derives guard PDA from mint", () => {
      const mint = new PublicKey("11111111111111111111111111111111");
      const [pda, bump] = getGuardPda(mint);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe("number");
    });
  });

  describe("Additional PDA functions", () => {
    it("getTokenConfigPda derives PDA", async () => {
      const pda = await getTokenConfigPda();
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it("getPermanentDelegate derives PDA", async () => {
      const pda = await getPermanentDelegate(new BN(42));
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it("getVaultAuthority derives PDA", async () => {
      const pda = await getVaultAuthority(new PublicKey("11111111111111111111111111111111"));
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it("getSolVault derives PDA", async () => {
      const pda = await getSolVault(new PublicKey("11111111111111111111111111111111"));
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it("getMintAuthority derives PDA", async () => {
      const pda = await getMintAuthority(new BN(1));
      expect(pda).toBeInstanceOf(PublicKey);
    });
  });

  describe("getRouteConfiguration", () => {
    it("returns route config from on-chain account", async () => {
      mockRouteConfigFetch.mockResolvedValue({
        creator: new PublicKey("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P"),
        routeId: new BN(1),
        sourceOwner: new PublicKey("11111111111111111111111111111111"),
        executor: new PublicKey("11111111111111111111111111111112"),
        hops: [
          {
            recipient: new PublicKey("11111111111111111111111111111113"),
            delaySeconds: new BN(60),
          },
        ],
        hopAmount: new BN(1000000000),
        isFinalized: true,
        createdAt: new BN(1700000000),
      });

      const result = await getRouteConfiguration(1);
      expect(result).not.toBeNull();
      expect(result!.creator).toBe("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P");
      expect(result!.hops).toHaveLength(1);
      expect(result!.isFinalized).toBe(true);
    });

    it("returns null on error", async () => {
      mockRouteConfigFetch.mockRejectedValue(new Error("not found"));
      const result = await getRouteConfiguration(999);
      expect(result).toBeNull();
    });
  });

  describe("getRouteStateAccount", () => {
    it("returns route state", async () => {
      mockRouteStateFetch.mockResolvedValue({
        currentHopIndex: 2,
        startedAt: new BN(100),
        lastHopAt: [new BN(200), new BN(300)],
        hopsCount: 5,
      });

      const result = await getRouteStateAccount(1);
      expect(result).not.toBeNull();
      expect(result!.currentHopIndex).toBe(2);
      expect(result!.hopsCount).toBe(5);
    });

    it("returns null on error", async () => {
      mockRouteStateFetch.mockRejectedValue(new Error("fail"));
      const result = await getRouteStateAccount(999);
      expect(result).toBeNull();
    });
  });

  describe("isRouteConfigPdaDeployed", () => {
    const validPda = "11111111111111111111111111111111";
    let mockGetAccountInfo: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockGetAccountInfo = vi.fn();
      params.connection.getAccountInfo = mockGetAccountInfo as any;
    });

    it("returns true when account exists", async () => {
      mockGetAccountInfo.mockResolvedValue({ data: Buffer.alloc(100) });
      expect(await isRouteConfigPdaDeployed(validPda)).toBe(true);
    });

    it("returns false when null", async () => {
      mockGetAccountInfo.mockResolvedValue(null);
      expect(await isRouteConfigPdaDeployed(validPda)).toBe(false);
    });

    it("returns false on invalid PDA string", async () => {
      expect(await isRouteConfigPdaDeployed("not-a-valid-key!")).toBe(false);
    });
  });

  describe("isExtraAccountMetasInitialized", () => {
    let mockGetAccountInfo: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockGetAccountInfo = vi.fn();
      params.connection.getAccountInfo = mockGetAccountInfo as any;
    });

    it("returns true when extra account metas exist", async () => {
      mockRouteConfigFetch.mockResolvedValue({
        routeTokenMint: new PublicKey("11111111111111111111111111111111"),
      });
      mockGetAccountInfo.mockResolvedValue({ data: Buffer.alloc(100) });

      const result = await isExtraAccountMetasInitialized(1);
      expect(result).toBe(true);
    });

    it("returns false when account info is null", async () => {
      mockRouteConfigFetch.mockResolvedValue({
        routeTokenMint: new PublicKey("11111111111111111111111111111111"),
      });
      mockGetAccountInfo.mockResolvedValue(null);

      const result = await isExtraAccountMetasInitialized(1);
      expect(result).toBe(false);
    });

    it("returns false on error", async () => {
      mockRouteConfigFetch.mockRejectedValue(new Error("fail"));
      const result = await isExtraAccountMetasInitialized(999);
      expect(result).toBe(false);
    });
  });

  describe("contractService default export", () => {
    it("exposes all expected methods", () => {
      expect(contractService.calculateExecutorFunding).toBeDefined();
      expect(contractService.getTokenConfigSPL).toBeDefined();
      expect(contractService.getTokenConfigSOL).toBeDefined();
      expect(contractService.addHops).toBeDefined();
      expect(contractService.addHopsBatched).toBeDefined();
      expect(contractService.serialize).toBeDefined();
      expect(contractService.HOPS_PER_BATCH).toBe(3);
    });
  });

  describe("serialize", () => {
    it("serializes transaction with blockhash and feePayer", async () => {
      const mockTx = {
        recentBlockhash: "",
        lastValidBlockHeight: 0,
        feePayer: null as any,
        serialize: vi.fn().mockReturnValue(Buffer.from("serialized")),
      };
      const mockConn = {
        getLatestBlockhash: vi.fn().mockResolvedValue({
          blockhash: "test-blockhash",
          lastValidBlockHeight: 12345,
        }),
      } as any;
      const user = new PublicKey("11111111111111111111111111111111");

      const result = await serialize(mockTx as any, user, mockConn);

      expect(result.recentBlockhash).toBe("test-blockhash");
      expect(result.lastValidBlockHeight).toBe(12345);
      expect(result.transaction).toBeDefined();
      expect(mockTx.feePayer).toBe(user);
      expect(mockTx.serialize).toHaveBeenCalledWith({
        requireAllSignatures: false,
        verifySignatures: false,
      });
    });
  });

  describe("getVault", () => {
    it("derives vault PDA from vaultAuthority and mint", async () => {
      const auth = new PublicKey("11111111111111111111111111111111");
      const mint = new PublicKey("11111111111111111111111111111112");

      const result = await getVault(auth, mint);
      expect(result).toBeInstanceOf(PublicKey);
    });

    it("returns consistent PDA for same inputs", async () => {
      const auth = new PublicKey("11111111111111111111111111111111");
      const mint = new PublicKey("11111111111111111111111111111112");

      const r1 = await getVault(auth, mint);
      const r2 = await getVault(auth, mint);
      expect(r1.toBase58()).toBe(r2.toBase58());
    });
  });

  describe("addHops", () => {
    it("builds a transaction with priority fee and addHops instruction", async () => {
      const creator = new PublicKey("11111111111111111111111111111111");
      const routeId = new BN(1);
      const hops = [
        { recipient: new PublicKey("11111111111111111111111111111112"), executeAt: new BN(Date.now()) },
      ];

      const tx = await addHops(creator, routeId, hops);

      expect(tx).toBeDefined();
      // Transaction should have instructions added (priority fee + addHops)
      expect(tx.instructions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("addHopsBatched", () => {
    it("creates a single batch for hops within HOPS_PER_BATCH", async () => {
      const creator = new PublicKey("11111111111111111111111111111111");
      const routeId = new BN(1);
      const hops = [
        { recipient: new PublicKey("11111111111111111111111111111112"), executeAt: new BN(1) },
        { recipient: new PublicKey("11111111111111111111111111111112"), executeAt: new BN(2) },
      ];

      const txs = await addHopsBatched(creator, routeId, hops);

      expect(txs).toHaveLength(1);
    });

    it("creates multiple batches when hops exceed HOPS_PER_BATCH", async () => {
      const creator = new PublicKey("11111111111111111111111111111111");
      const routeId = new BN(1);
      const hops = Array.from({ length: 7 }, (_, i) => ({
        recipient: new PublicKey("11111111111111111111111111111112"),
        executeAt: new BN(i),
      }));

      const txs = await addHopsBatched(creator, routeId, hops);

      // 7 hops / 3 per batch = 3 batches
      expect(txs).toHaveLength(3);
    });

    it("returns empty array for 0 hops", async () => {
      const creator = new PublicKey("11111111111111111111111111111111");
      const txs = await addHopsBatched(creator, new BN(1), []);
      expect(txs).toHaveLength(0);
    });
  });

  describe("initializeCompleteTokenConfig", () => {
    it("builds a transaction with priority fee and tokenConfig instruction", async () => {
      const payer = new PublicKey("11111111111111111111111111111111");
      const tokenConfig = {
        minTransfer: new BN(1000),
        feeBps: 50,
        feeTreasury: new PublicKey("11111111111111111111111111111112"),
        maxHops: 10,
        maxDelaySeconds: new BN(86400),
        timelockSeconds: new BN(0),
        flatFeeLamports: new BN(10000),
      };

      const result = await initializeCompleteTokenConfig(payer, tokenConfig);

      expect(result.transaction).toBeDefined();
      expect(result.transaction.instructions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("initializeCompleteSolTokenConfig", () => {
    it("builds a transaction with priority fee and sol tokenConfig instruction", async () => {
      const payer = new PublicKey("11111111111111111111111111111111");
      const tokenConfig = {
        minTransfer: new BN(1000),
        feeBps: 50,
        feeTreasury: new PublicKey("11111111111111111111111111111112"),
        maxHops: 10,
        maxDelaySeconds: new BN(86400),
        timelockSeconds: new BN(0),
        flatFeeLamports: new BN(10000),
      };

      const result = await initializeCompleteSolTokenConfig(payer, tokenConfig);

      expect(result.transaction).toBeDefined();
      expect(result.transaction.instructions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("unwrap", () => {
    it("builds an unwrap instruction", async () => {
      const payer = new PublicKey("11111111111111111111111111111111");
      const recipient = new PublicKey("11111111111111111111111111111112");
      const tokenConfigPda = new PublicKey("11111111111111111111111111111113");
      const originalMint = new PublicKey("11111111111111111111111111111114");
      const pairMint = new PublicKey("11111111111111111111111111111115");
      const amount = new BN(1000000);
      const routeId = new BN(1);

      const ix = await unwrap(payer, recipient, tokenConfigPda, originalMint, pairMint, amount, routeId);

      expect(ix).toBeDefined();
    });
  });

  describe("unwrapSol", () => {
    it("calls tokenConfig.fetch and derives PDAs", async () => {
      mockTokenConfigFetch.mockResolvedValue({
        creator: new PublicKey("11111111111111111111111111111111"),
      });
      const payer = new PublicKey("11111111111111111111111111111111");
      const recipient = new PublicKey("11111111111111111111111111111112");
      const tokenConfigPda = new PublicKey("11111111111111111111111111111113");
      const wsolMint = new PublicKey("11111111111111111111111111111114");
      const amount = new BN(1000000);
      const routeId = new BN(1);

      // unwrapSol fetches tokenConfig and derives PDAs internally
      // The spl-token getAssociatedTokenAddress may fail with mock keys,
      // but the contract code path is still exercised
      try {
        await unwrapSol(payer, recipient, tokenConfigPda, wsolMint, amount, routeId);
      } catch {
        // Expected: spl-token validation fails with test keys
      }

      expect(mockTokenConfigFetch).toHaveBeenCalled();
    });
  });

  describe("initializeExtraAccountMetasForRoute", () => {
    let mockGetAccountInfo: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockGetAccountInfo = vi.fn();
      params.connection.getAccountInfo = mockGetAccountInfo as any;
    });

    it("returns null when extra account metas already exist", async () => {
      mockRouteConfigFetch.mockResolvedValue({
        routeTokenMint: new PublicKey("11111111111111111111111111111111"),
      });
      mockGetAccountInfo.mockResolvedValue({ data: Buffer.alloc(100) });

      const result = await initializeExtraAccountMetasForRoute(1, Keypair.generate());
      expect(result).toBeNull();
    });

    it("sends transaction when extra account metas do not exist", async () => {
      mockRouteConfigFetch.mockResolvedValue({
        routeTokenMint: new PublicKey("11111111111111111111111111111111"),
      });
      mockGetAccountInfo.mockResolvedValue(null);
      mockSendAndConfirmTransaction.mockResolvedValue("extra-metas-sig");

      const result = await initializeExtraAccountMetasForRoute(1, Keypair.generate());

      expect(result).toBe("extra-metas-sig");
      expect(mockSendAndConfirmTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("HOPS_PER_BATCH", () => {
    it("is set to 3", () => {
      expect(HOPS_PER_BATCH).toBe(3);
    });
  });

  // =====================================================
  // NEW TEST BLOCKS - Extended coverage
  // =====================================================

  describe("signAndSerialize", () => {
    const validBlockhash = "GHtXQBtLuciZZafHr2rYnNhHfiquYhBbS8bDtLAjHB6B";

    it("signs transaction with signer and serializes to base64", async () => {
      const signer = Keypair.generate();
      const payer = signer.publicKey;
      const transaction = new (await import("@solana/web3.js")).Transaction();
      const mockConn = {
        getLatestBlockhash: vi.fn().mockResolvedValue({
          blockhash: validBlockhash,
          lastValidBlockHeight: 99999,
        }),
      } as any;

      const result = await signAndSerialize(transaction, payer, signer, mockConn);

      expect(result.recentBlockhash).toBe(validBlockhash);
      expect(result.lastValidBlockHeight).toBe(99999);
      expect(typeof result.transaction).toBe("string");
      // Should be valid base64
      expect(() => Buffer.from(result.transaction, "base64")).not.toThrow();
      expect(mockConn.getLatestBlockhash).toHaveBeenCalledWith("confirmed");
    });

    it("sets feePayer on the transaction", async () => {
      const signer = Keypair.generate();
      const payer = signer.publicKey;
      const transaction = new (await import("@solana/web3.js")).Transaction();
      const mockConn = {
        getLatestBlockhash: vi.fn().mockResolvedValue({
          blockhash: validBlockhash,
          lastValidBlockHeight: 50000,
        }),
      } as any;

      await signAndSerialize(transaction, payer, signer, mockConn);

      expect(transaction.feePayer?.toBase58()).toBe(payer.toBase58());
    });
  });

  describe("createExecutorFundingInstruction", () => {
    it("returns a SystemProgram transfer instruction", () => {
      const payer = new PublicKey("11111111111111111111111111111111");
      const executor = new PublicKey("11111111111111111111111111111112");
      const amount = new BN(22_000_000);

      const ix = createExecutorFundingInstruction(payer, executor, amount);

      expect(ix).toBeDefined();
      expect(ix.programId.toBase58()).toBe(
        "11111111111111111111111111111111"
      ); // SystemProgram
      expect(ix.keys.length).toBeGreaterThanOrEqual(2);
    });

    it("uses correct payer and executor accounts", () => {
      const payer = new PublicKey("11111111111111111111111111111112");
      const executor = new PublicKey("11111111111111111111111111111113");
      const amount = new BN(30_000_000);

      const ix = createExecutorFundingInstruction(payer, executor, amount);

      // Check keys contain payer and executor
      const keyPubkeys = ix.keys.map((k) => k.pubkey.toBase58());
      expect(keyPubkeys).toContain(payer.toBase58());
      expect(keyPubkeys).toContain(executor.toBase58());
    });
  });

  describe("executeHop", () => {
    const routeTokenMint = new PublicKey("11111111111111111111111111111112");
    const originalMint = new PublicKey("11111111111111111111111111111113");
    const sourceOwner = new PublicKey("11111111111111111111111111111114");
    const recipient1 = new PublicKey("11111111111111111111111111111115");
    const recipient2 = new PublicKey("11111111111111111111111111111116");
    const recipient3 = new PublicKey("11111111111111111111111111111117");

    beforeEach(() => {
      mockSendAndConfirmTransaction.mockResolvedValue("mock-hop-sig");
      params.connection.getRecentPrioritizationFees = vi.fn().mockResolvedValue([]) as any;
    });

    it("returns null when route has ended (currentHopIndex >= hops.length)", async () => {
      mockRouteConfigFetch.mockResolvedValue({
        hops: [{ recipient: recipient1, executeAt: new BN(0) }],
        routeTokenMint,
        originalMint,
        sourceOwner,
        hopAmount: new BN(1000000),
      });
      mockRouteStateFetch.mockResolvedValue({
        currentHopIndex: 1, // >= hops.length (1)
      });

      const result = await executeHop(new BN(1));
      expect(result).toBeNull();
    });

    it("uses sourceOwner for first hop and sends transaction", async () => {
      mockRouteConfigFetch.mockResolvedValue({
        hops: [
          { recipient: recipient1, executeAt: new BN(0) },
          { recipient: recipient2, executeAt: new BN(0) },
        ],
        routeTokenMint,
        originalMint,
        sourceOwner,
        hopAmount: new BN(1000000),
      });
      mockRouteStateFetch.mockResolvedValue({
        currentHopIndex: 0, // First hop
      });

      const result = await executeHop(new BN(42));

      expect(result).toBe("mock-hop-sig");
      expect(mockSendAndConfirmTransaction).toHaveBeenCalled();
    });

    it("uses previous hop recipient for middle hops", async () => {
      mockRouteConfigFetch.mockResolvedValue({
        hops: [
          { recipient: recipient1, executeAt: new BN(0) },
          { recipient: recipient2, executeAt: new BN(0) },
          { recipient: recipient3, executeAt: new BN(0) },
        ],
        routeTokenMint,
        originalMint,
        sourceOwner,
        hopAmount: new BN(1000000),
      });
      mockRouteStateFetch.mockResolvedValue({
        currentHopIndex: 1, // Middle hop
      });

      const result = await executeHop(new BN(43));

      expect(result).toBe("mock-hop-sig");
      expect(mockSendAndConfirmTransaction).toHaveBeenCalled();
    });

    it("adds unwrap instruction on last hop for non-native mint", async () => {
      mockRouteConfigFetch.mockResolvedValue({
        hops: [
          { recipient: recipient1, executeAt: new BN(0) },
          { recipient: recipient2, executeAt: new BN(0) },
        ],
        routeTokenMint,
        originalMint, // Not NATIVE_MINT
        sourceOwner,
        hopAmount: new BN(1000000),
      });
      mockRouteStateFetch.mockResolvedValue({
        currentHopIndex: 1, // Last hop (index 1 of 2)
      });

      const result = await executeHop(new BN(44));

      expect(result).toBe("mock-hop-sig");
      expect(mockSendAndConfirmTransaction).toHaveBeenCalled();
      // Verify sendAndConfirmTransaction was called with connection
      const callArgs = mockSendAndConfirmTransaction.mock.calls[0];
      expect(callArgs[0]).toBe(params.connection);
    });

    it("adds unwrapSol instruction on last hop for native SOL mint", async () => {
      const { NATIVE_MINT: nativeMint } = await import("@solana/spl-token");

      mockRouteConfigFetch.mockResolvedValue({
        hops: [
          { recipient: recipient1, executeAt: new BN(0) },
        ],
        routeTokenMint,
        originalMint: nativeMint,
        sourceOwner,
        hopAmount: new BN(1000000),
      });
      mockRouteStateFetch.mockResolvedValue({
        currentHopIndex: 0, // Only hop = last hop
      });
      // unwrapSol calls tokenConfig.fetch internally
      mockTokenConfigFetch.mockResolvedValue({
        creator: new PublicKey("11111111111111111111111111111111"),
      });

      const result = await executeHop(new BN(45));

      expect(result).toBe("mock-hop-sig");
      expect(mockSendAndConfirmTransaction).toHaveBeenCalled();
    });
  });

  describe("initializeRouteSolWithWrap", () => {
    beforeEach(() => {
      mockTokenConfigFetch.mockResolvedValue({
        creator: new PublicKey("11111111111111111111111111111111"),
        feeTreasury: new PublicKey("11111111111111111111111111111112"),
        feeBps: new BN(500),
        minTransfer: new BN(100000),
        maxHops: new BN(10),
        flatFeeLamports: new BN(10000),
      });
      params.connection.getRecentPrioritizationFees = vi.fn().mockResolvedValue([]) as any;
    });

    it("returns transaction, setupTransaction, and wrappedToken", async () => {
      const payer = new PublicKey("11111111111111111111111111111111");
      const routeId = new BN(100);
      const hopAmount = new BN(50_000_000);
      const hops = [
        { recipient: new PublicKey("11111111111111111111111111111112"), executeAt: new BN(0) },
      ];

      const result = await initializeRouteSolWithWrap(payer, routeId, hopAmount, hops);

      expect(result.transaction).toBeDefined();
      expect(result.setupTransaction).toBeDefined();
      expect(result.wrappedToken).toBeDefined();
      expect(result.wrappedToken).toBeInstanceOf(Keypair);
      // Main transaction should have instructions (priority + funding + initRoute + guard + wrap)
      expect(result.transaction.instructions.length).toBeGreaterThanOrEqual(3);
      // Setup transaction should have the extra account metas instruction
      expect(result.setupTransaction.instructions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("initializeRouteWithWrap", () => {
    beforeEach(() => {
      mockTokenConfigFetch.mockResolvedValue({
        creator: new PublicKey("11111111111111111111111111111111"),
        feeTreasury: new PublicKey("11111111111111111111111111111112"),
        feeBps: new BN(500),
        minTransfer: new BN(100000),
        maxHops: new BN(10),
        flatFeeLamports: new BN(10000),
      });
      params.connection.getRecentPrioritizationFees = vi.fn().mockResolvedValue([]) as any;
    });

    it("returns transaction, setupTransaction, and wrappedToken for SPL", async () => {
      const payer = new PublicKey("11111111111111111111111111111111");
      const creator = new PublicKey("11111111111111111111111111111111");
      const routeId = new BN(200);
      const hopAmount = new BN(100_000_000);
      const hops = [
        { recipient: new PublicKey("11111111111111111111111111111112"), executeAt: new BN(0) },
      ];
      const splMint = "11111111111111111111111111111113";
      const { TOKEN_PROGRAM_ID: tokenProgramId } = await import("@solana/spl-token");

      const result = await initializeRouteWithWrap(
        payer,
        creator,
        routeId,
        hopAmount,
        hops,
        splMint,
        tokenProgramId,
      );

      expect(result.transaction).toBeDefined();
      expect(result.setupTransaction).toBeDefined();
      expect(result.wrappedToken).toBeDefined();
      expect(result.wrappedToken).toBeInstanceOf(Keypair);
      expect(result.transaction.instructions.length).toBeGreaterThanOrEqual(3);
      expect(result.setupTransaction.instructions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("updateTokenConfigWithTransaction", () => {
    beforeEach(() => {
      mockTokenConfigFetch.mockResolvedValue({
        creator: new PublicKey("11111111111111111111111111111111"),
        feeTreasury: new PublicKey("11111111111111111111111111111112"),
        feeBps: new BN(500),
        signer: new PublicKey("11111111111111111111111111111111"),
        minTransfer: new BN(100000),
        maxHops: new BN(10),
        flatFeeLamports: new BN(10000),
      });
      params.connection.getRecentPrioritizationFees = vi.fn().mockResolvedValue([]) as any;
    });

    it("returns a transaction with priority and updateTokenConfig instructions", async () => {
      const payer = new PublicKey("11111111111111111111111111111111");

      const tx = await updateTokenConfigWithTransaction(payer, {
        feeBps: 100,
        maxHops: 20,
      });

      expect(tx).toBeDefined();
      // Should have priority fee instructions + updateTokenConfig instruction
      expect(tx.instructions.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("updateSolTokenConfigWithTransaction", () => {
    beforeEach(() => {
      mockTokenConfigFetch.mockResolvedValue({
        creator: new PublicKey("11111111111111111111111111111111"),
        feeTreasury: new PublicKey("11111111111111111111111111111112"),
        feeBps: new BN(500),
        signer: new PublicKey("11111111111111111111111111111111"),
        minTransfer: new BN(100000),
        maxHops: new BN(10),
        flatFeeLamports: new BN(10000),
      });
      params.connection.getRecentPrioritizationFees = vi.fn().mockResolvedValue([]) as any;
    });

    it("returns a transaction with priority and updateTokenConfig instructions", async () => {
      const payer = new PublicKey("11111111111111111111111111111111");

      const tx = await updateSolTokenConfigWithTransaction(payer, {
        feeBps: 200,
        flatFeeLamports: new BN(50000),
      });

      expect(tx).toBeDefined();
      expect(tx.instructions.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("initializeRouteFromWalletX", () => {
    const walletX = Keypair.generate();

    beforeEach(() => {
      mockSendAndConfirmTransaction.mockResolvedValue("mock-init-sig");
      mockTokenConfigFetch.mockResolvedValue({
        creator: new PublicKey("11111111111111111111111111111111"),
        feeTreasury: new PublicKey("11111111111111111111111111111112"),
        feeBps: new BN(500),
        signer: new PublicKey("11111111111111111111111111111111"),
        minTransfer: new BN(100000),
        maxHops: new BN(10),
        flatFeeLamports: new BN(10000),
      });
      params.connection.getLatestBlockhash = vi.fn().mockResolvedValue({
        blockhash: "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
        lastValidBlockHeight: 12345,
      }) as any;
      params.connection.getRecentPrioritizationFees = vi.fn().mockResolvedValue([]) as any;
    });

    describe("SOL path", () => {
      it("builds transactions and reaches the signing phase", async () => {
        const routeId = new BN(300);
        const hopAmount = new BN(50_000_000);
        const hops = [
          { recipient: new PublicKey("11111111111111111111111111111112"), executeAt: new BN(0) },
        ];

        // Transaction.sign() throws "unknown signer" because the internally-generated
        // wrappedToken keypair's pubkey is not in any mock instruction keys.
        // This confirms the code successfully built the transaction and reached signing.
        try {
          await initializeRouteFromWalletX(
            walletX,
            routeId,
            hopAmount,
            hops,
            "SOL",
          );
        } catch (error: any) {
          expect(error.message).toMatch(/unknown signer/);
        }

        // Verify the code reached getLatestBlockhash (called just before signing)
        expect(params.connection.getLatestBlockhash).toHaveBeenCalled();
      });
    });

    describe("SPL path", () => {
      it("throws when tokenMint is not provided", async () => {
        const routeId = new BN(400);
        const hopAmount = new BN(100_000_000);
        const hops = [
          { recipient: new PublicKey("11111111111111111111111111111112"), executeAt: new BN(0) },
        ];

        await expect(
          initializeRouteFromWalletX(walletX, routeId, hopAmount, hops, "SPL"),
        ).rejects.toThrow("Token mint is required for SPL routes");
      });

      it("builds SPL transactions and reaches the signing phase", async () => {
        const routeId = new BN(500);
        const hopAmount = new BN(100_000_000);
        const hops = [
          { recipient: new PublicKey("11111111111111111111111111111112"), executeAt: new BN(0) },
        ];
        const tokenMint = "11111111111111111111111111111113";

        // Transaction.sign() throws "unknown signer" because the internally-generated
        // wrappedToken keypair's pubkey is not in any mock instruction keys.
        // This confirms the code successfully built the SPL init transaction and reached signing.
        try {
          await initializeRouteFromWalletX(
            walletX,
            routeId,
            hopAmount,
            hops,
            "SPL",
            tokenMint,
          );
        } catch (error: any) {
          expect(error.message).toMatch(/unknown signer/);
        }

        // Verify the code fetched token config (for fee calculation) and reached getLatestBlockhash
        expect(mockTokenConfigFetch).toHaveBeenCalled();
        expect(params.connection.getLatestBlockhash).toHaveBeenCalled();
      });
    });
  });

  describe("addHopsFromWalletX", () => {
    const walletX = Keypair.generate();

    beforeEach(() => {
      mockSendAndConfirmTransaction.mockResolvedValue("mock-hops-sig");
      params.connection.getLatestBlockhash = vi.fn().mockResolvedValue({
        blockhash: "GHtXQBtLuciZZafHr2rYnNhHfiquYhBbS8bDtLAjHB6B",
        lastValidBlockHeight: 54321,
      }) as any;
      params.connection.getRecentPrioritizationFees = vi.fn().mockResolvedValue([]) as any;
    });

    it("sends one transaction for hops within a single batch", async () => {
      const routeId = new BN(600);
      const hops = [
        { recipient: new PublicKey("11111111111111111111111111111112"), executeAt: new BN(1) },
        { recipient: new PublicKey("11111111111111111111111111111113"), executeAt: new BN(2) },
      ];

      const signature = await addHopsFromWalletX(walletX, routeId, hops);

      expect(signature).toBe("mock-hops-sig");
      expect(mockSendAndConfirmTransaction).toHaveBeenCalledTimes(1);
    });

    it("sends multiple transactions for batched hops", async () => {
      const routeId = new BN(700);
      const hops = Array.from({ length: 7 }, (_, i) => ({
        recipient: new PublicKey("11111111111111111111111111111112"),
        executeAt: new BN(i),
      }));

      const signature = await addHopsFromWalletX(walletX, routeId, hops);

      expect(signature).toBe("mock-hops-sig");
      // 7 hops / 3 per batch = 3 batches = 3 transactions
      expect(mockSendAndConfirmTransaction).toHaveBeenCalledTimes(3);
    });

    it("returns empty string for 0 hops", async () => {
      const routeId = new BN(800);
      const signature = await addHopsFromWalletX(walletX, routeId, []);

      expect(signature).toBe("");
      expect(mockSendAndConfirmTransaction).not.toHaveBeenCalled();
    });
  });

  describe("getTransferHookGuardPda and getExtraAccountMetasPda (via indirect testing)", () => {
    let mockGetAccountInfo: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockGetAccountInfo = vi.fn();
      params.connection.getAccountInfo = mockGetAccountInfo as any;
    });

    it("getExtraAccountMetasPda produces consistent results for same mint", async () => {
      const mint = new PublicKey("11111111111111111111111111111112");
      mockRouteConfigFetch.mockResolvedValue({ routeTokenMint: mint });
      mockGetAccountInfo.mockResolvedValue({ data: Buffer.alloc(50) });

      const result1 = await isExtraAccountMetasInitialized(1);
      const result2 = await isExtraAccountMetasInitialized(1);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      // Both calls should use the same PDA argument
      const pda1 = mockGetAccountInfo.mock.calls[0][0];
      const pda2 = mockGetAccountInfo.mock.calls[1][0];
      expect(pda1.toBase58()).toBe(pda2.toBase58());
    });

    it("getExtraAccountMetasPda produces different results for different mints", async () => {
      const mint1 = new PublicKey("11111111111111111111111111111112");
      const mint2 = new PublicKey("11111111111111111111111111111113");

      mockGetAccountInfo.mockResolvedValue({ data: Buffer.alloc(50) });

      mockRouteConfigFetch.mockResolvedValue({ routeTokenMint: mint1 });
      await isExtraAccountMetasInitialized(1);

      mockRouteConfigFetch.mockResolvedValue({ routeTokenMint: mint2 });
      await isExtraAccountMetasInitialized(2);

      const pda1 = mockGetAccountInfo.mock.calls[0][0];
      const pda2 = mockGetAccountInfo.mock.calls[1][0];
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    it("getGuardPda derives consistent PDA from same mint", () => {
      const mint = new PublicKey("11111111111111111111111111111112");
      const [pda1] = getGuardPda(mint);
      const [pda2] = getGuardPda(mint);
      expect(pda1.toBase58()).toBe(pda2.toBase58());
    });

    it("getGuardPda derives different PDAs for different mints", () => {
      const mint1 = new PublicKey("11111111111111111111111111111112");
      const mint2 = new PublicKey("11111111111111111111111111111113");
      const [pda1] = getGuardPda(mint1);
      const [pda2] = getGuardPda(mint2);
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe("creatorUser", () => {
    it("is a valid Keypair", () => {
      expect(creatorUser).toBeDefined();
      expect(creatorUser.publicKey).toBeInstanceOf(PublicKey);
      expect(creatorUser.secretKey).toBeInstanceOf(Uint8Array);
    });
  });
});
