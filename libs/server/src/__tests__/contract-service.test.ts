import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PublicKey, Connection } from "@solana/web3.js";
import { BN, Program } from "@coral-xyz/anchor";

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

// Mock the Anchor Program and account fetches
const mockRouteConfigFetch = vi.fn();
const mockRouteStateFetch = vi.fn();
const mockTokenConfigFetch = vi.fn();

vi.mock("@coral-xyz/anchor", async () => {
  const actual = await vi.importActual("@coral-xyz/anchor");
  return {
    ...actual,
    Program: vi.fn().mockImplementation(() => ({
      account: {
        routeConfig: {
          fetch: mockRouteConfigFetch,
        },
        routeState: {
          fetch: mockRouteStateFetch,
        },
        tokenConfig: {
          fetch: mockTokenConfigFetch,
        },
      },
      methods: {},
    })),
    AnchorProvider: vi.fn().mockImplementation(() => ({})),
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
  calculateExecutorFunding,
} from "../solana/services/contract.service";

describe("Contract Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
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
    describe("Route Exists", () => {
      it("should return true when route config PDA exists", async () => {
        mockRouteConfigFetch.mockResolvedValue({
          creator: new PublicKey("11111111111111111111111111111111"),
          routeId: new BN(123),
          hops: [],
        });

        const result = await isRouteDeployedOnChain(123);

        expect(result).toBe(true);
      });

      it("should return true for various route IDs", async () => {
        mockRouteConfigFetch.mockResolvedValue({
          creator: new PublicKey("11111111111111111111111111111111"),
          routeId: new BN(999),
          hops: [],
        });

        expect(await isRouteDeployedOnChain(1)).toBe(true);
        expect(await isRouteDeployedOnChain(100)).toBe(true);
        expect(await isRouteDeployedOnChain(999999)).toBe(true);
      });
    });

    describe("Route Does Not Exist", () => {
      it("should return false when route config PDA does not exist", async () => {
        mockRouteConfigFetch.mockRejectedValue(new Error("Account does not exist"));

        const result = await isRouteDeployedOnChain(456);

        expect(result).toBe(false);
      });

      it("should return false when account is not initialized", async () => {
        mockRouteConfigFetch.mockRejectedValue(new Error("Account is not initialized"));

        const result = await isRouteDeployedOnChain(789);

        expect(result).toBe(false);
      });
    });

    describe("Error Handling - RPC Errors", () => {
      it("should return false on network errors", async () => {
        mockRouteConfigFetch.mockRejectedValue(new Error("Network error"));

        const result = await isRouteDeployedOnChain(1000);

        expect(result).toBe(false);
      });

      it("should return false on connection errors", async () => {
        mockRouteConfigFetch.mockRejectedValue(new Error("ECONNREFUSED"));

        const result = await isRouteDeployedOnChain(1001);

        expect(result).toBe(false);
      });

      it("should return false on RPC rate limiting", async () => {
        mockRouteConfigFetch.mockRejectedValue(new Error("429 Too Many Requests"));

        const result = await isRouteDeployedOnChain(1002);

        expect(result).toBe(false);
      });

      it("should return false on RPC service unavailable", async () => {
        mockRouteConfigFetch.mockRejectedValue(new Error("503 Service Unavailable"));

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

    describe("Token Config Differences", () => {
      it("should demonstrate SPL vs SOL token config feeBps difference", async () => {
        mockTokenConfigFetch.mockResolvedValue({
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
});
