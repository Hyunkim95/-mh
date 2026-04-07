import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.SOLANA_RPC_URL = "http://localhost:8899";

// Mock Solana dependencies before anything else
vi.mock("@solana/web3.js", () => {
  class MockPublicKey {
    _key: string;
    constructor(key: string) { this._key = key; }
    toBase58() { return this._key; }
    toString() { return this._key; }
    equals(other: any) { return this._key === other?._key; }
  }
  return {
    PublicKey: MockPublicKey,
    Connection: vi.fn(),
    clusterApiUrl: vi.fn(),
    Keypair: { generate: vi.fn() },
    Transaction: vi.fn(),
    SystemProgram: { programId: new MockPublicKey("11111111111111111111111111111111") },
    LAMPORTS_PER_SOL: 1_000_000_000,
  };
});

vi.mock("@coral-xyz/anchor", () => ({
  BN: class MockBN {
    _val: any;
    constructor(val: any) { this._val = val; }
    toNumber() { return Number(this._val); }
    toString() { return String(this._val); }
  },
}));

vi.mock("@solana/spl-token", () => ({
  TOKEN_PROGRAM_ID: { _key: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
}));

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  initializeCompleteTokenConfig: vi.fn(),
  initializeCompleteSolTokenConfig: vi.fn(),
  updateTokenConfigWithTransaction: vi.fn(),
  updateSolTokenConfigWithTransaction: vi.fn(),
  getTokenConfigSPL: vi.fn(),
  getTokenConfigSOL: vi.fn(),
  signAndSerialize: vi.fn(),
  initializeRouteWithWrap: vi.fn(),
  initializeRouteSolWithWrap: vi.fn(),
  getRouteConfiguration: vi.fn(),
  getRouteStateAccount: vi.fn(),
  executeHop: vi.fn(),
  routeHasHops: vi.fn(),
  serialize: vi.fn(),
  estimateDeploymentCost: vi.fn(),
  addHops: vi.fn(),
  addHopsBatched: vi.fn(),
  HOPS_PER_BATCH: 5,
  params: { connection: {} },
  getExecutorPublicKey: vi.fn(),
  getSigner: vi.fn(),
  balance: vi.fn(),
  withdrawOnBehalf: vi.fn(),
}));

vi.mock("../solana/services/contract.service", () => ({
  default: {
    addHops: mocks.addHops,
    addHopsBatched: mocks.addHopsBatched,
    HOPS_PER_BATCH: mocks.HOPS_PER_BATCH,
  },
  initializeCompleteTokenConfig: mocks.initializeCompleteTokenConfig,
  initializeCompleteSolTokenConfig: mocks.initializeCompleteSolTokenConfig,
  updateTokenConfigWithTransaction: mocks.updateTokenConfigWithTransaction,
  updateSolTokenConfigWithTransaction: mocks.updateSolTokenConfigWithTransaction,
  getTokenConfigSPL: mocks.getTokenConfigSPL,
  getTokenConfigSOL: mocks.getTokenConfigSOL,
  signAndSerialize: mocks.signAndSerialize,
  initializeRouteWithWrap: mocks.initializeRouteWithWrap,
  initializeRouteSolWithWrap: mocks.initializeRouteSolWithWrap,
  getRouteConfiguration: mocks.getRouteConfiguration,
  getRouteStateAccount: mocks.getRouteStateAccount,
  executeHop: mocks.executeHop,
  routeHasHops: mocks.routeHasHops,
  serialize: mocks.serialize,
  estimateDeploymentCost: mocks.estimateDeploymentCost,
  params: mocks.params,
}));

vi.mock("../executors/executor.service", () => ({
  default: {
    getExecutorPublicKey: mocks.getExecutorPublicKey,
    getSigner: mocks.getSigner,
    balance: mocks.balance,
    withdrawOnBehalf: mocks.withdrawOnBehalf,
  },
}));

vi.mock("@libs/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("bs58", () => ({
  default: { encode: vi.fn((_bytes: Uint8Array) => "encoded-bs58") },
}));

import { contractRouter } from "../routers/contract.router";

const authCtx = {
  user: {
    publicKey: "11111111111111111111111111111111",
  },
};

const caller = contractRouter.createCaller(authCtx as any);
const unauthenticatedCaller = contractRouter.createCaller({ user: null } as any);

// Valid Solana-like public key (base58, 32-44 chars)
const CREATOR = "11111111111111111111111111111111";
const TREASURY = "22222222222222222222222222222222";
const SPL_MINT = "33333333333333333333333333333333";
const RECIPIENT = "44444444444444444444444444444444";

const tokenConfig = {
  minTransfer: "1000",
  feeBps: "50",
  feeTreasury: TREASURY,
  maxHops: "10",
  maxDelaySeconds: "3600",
  timelockSeconds: "0",
  flatFeeLamports: "10000",
};

describe("contractRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serialize.mockResolvedValue({ transaction: "serialized-tx" });
    mocks.signAndSerialize.mockResolvedValue({ transaction: "signed-tx" });
    mocks.getSigner.mockReturnValue({});
    mocks.getExecutorPublicKey.mockReturnValue("executor-pubkey");
  });

  describe("initializeTokenConfig", () => {
    it("requires authentication", async () => {
      await expect(
        unauthenticatedCaller.initializeTokenConfig({
          tokenConfig,
        })
      ).rejects.toThrow("UNAUTHORIZED");
    });

    it("returns serialized transaction on success", async () => {
      mocks.initializeCompleteTokenConfig.mockResolvedValue({
        transaction: "raw-tx",
      });

      const result = await caller.initializeTokenConfig({
        tokenConfig,
      });

      expect(result.success).toBe(true);
      expect(result.data.transaction).toBe("serialized-tx");
      expect(mocks.initializeCompleteTokenConfig).toHaveBeenCalled();
    });

    it("throws TRPCError on failure", async () => {
      mocks.initializeCompleteTokenConfig.mockRejectedValue(
        new Error("init failed")
      );

      await expect(
        caller.initializeTokenConfig({ tokenConfig })
      ).rejects.toThrow("init failed");
    });
  });

  describe("initializeTokenConfigSOL", () => {
    it("returns serialized transaction on success", async () => {
      mocks.initializeCompleteSolTokenConfig.mockResolvedValue({
        transaction: "raw-tx",
      });

      const result = await caller.initializeTokenConfigSOL({
        tokenConfig,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("updateTokenConfig", () => {
    it("returns signed transaction on success", async () => {
      mocks.updateTokenConfigWithTransaction.mockResolvedValue("raw-tx");

      const result = await caller.updateTokenConfig({
        tokenConfig,
      });

      expect(result.success).toBe(true);
      expect(mocks.getSigner).toHaveBeenCalled();
      expect(mocks.signAndSerialize).toHaveBeenCalled();
    });
  });

  describe("updateTokenConfigSOL", () => {
    it("returns signed transaction on success", async () => {
      mocks.updateSolTokenConfigWithTransaction.mockResolvedValue("raw-tx");

      const result = await caller.updateTokenConfigSOL({
        tokenConfig,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("getTokenConfigSPL", () => {
    it("returns token config data", async () => {
      mocks.getTokenConfigSPL.mockResolvedValue({ feeBps: 50 });

      const result = await caller.getTokenConfigSPL();

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ feeBps: 50 });
    });
  });

  describe("getTokenConfigSOL", () => {
    it("returns token config data", async () => {
      mocks.getTokenConfigSOL.mockResolvedValue({ feeBps: 100 });

      const result = await caller.getTokenConfigSOL({});

      expect(result.success).toBe(true);
    });
  });

  describe("initializeRoute", () => {
    const input = {
      routeId: 1,
      splMint: SPL_MINT,
      hopAmount: "1000000",
      hops: [{ recipient: RECIPIENT, scheduledAt: Date.now() + 60000 }],
    };

    it("returns serialized transaction + keypair", async () => {
      mocks.initializeRouteWithWrap.mockResolvedValue({
        transaction: "raw-tx",
        setupTransaction: "setup-tx",
        wrappedToken: { secretKey: new Uint8Array(64) },
      });

      const result = await caller.initializeRoute(input);

      expect(result.success).toBe(true);
      expect(result.data.additionalSignerSecret).toBe("encoded-bs58");
      expect(result.data.executorPublicKey).toBe("executor-pubkey");
    });
  });

  describe("initializeRouteSOL", () => {
    it("returns serialized transaction on success", async () => {
      mocks.initializeRouteSolWithWrap.mockResolvedValue({
        transaction: "raw-tx",
        setupTransaction: "setup-tx",
        wrappedToken: { secretKey: new Uint8Array(64) },
      });

      const result = await caller.initializeRouteSOL({
        routeId: 1,
        hopAmount: "1000000",
        hops: [{ recipient: RECIPIENT, scheduledAt: Date.now() + 60000 }],
        splMint: SPL_MINT,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("routeHasHops", () => {
    it("returns result", async () => {
      mocks.routeHasHops.mockResolvedValue({ hasHops: true, count: 3 });

      const result = await caller.routeHasHops({ routeId: 1 });

      expect(result.success).toBe(true);
      expect(result.data.routeId).toBe(1);
      expect(result.data.hasHops).toBe(true);
    });
  });

  describe("addHops", () => {
    it("returns serialized transaction", async () => {
      mocks.addHops.mockResolvedValue("raw-tx");

      const result = await caller.addHops({
        routeId: 1,
        hops: [{ recipient: RECIPIENT, scheduledAt: Date.now() + 60000 }],
      });

      expect(result.success).toBe(true);
    });
  });

  describe("addHopsBatched", () => {
    it("returns batched transactions", async () => {
      mocks.addHopsBatched.mockResolvedValue(["tx1", "tx2"]);

      const result = await caller.addHopsBatched({
        routeId: 1,
        hops: [
          { recipient: RECIPIENT, scheduledAt: Date.now() + 60000 },
          { recipient: RECIPIENT, scheduledAt: Date.now() + 120000 },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.data.totalBatches).toBe(2);
      expect(result.data.totalHops).toBe(2);
    });
  });

  describe("getRouteConfig", () => {
    it("returns route config when found", async () => {
      mocks.getRouteConfiguration.mockResolvedValue({ routeId: 1 });

      const result = await caller.getRouteConfig({ routeId: 1 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ routeId: 1 });
    });

    it("returns success=false when not found", async () => {
      mocks.getRouteConfiguration.mockResolvedValue(null);

      const result = await caller.getRouteConfig({ routeId: 999 });

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
    });
  });

  describe("getRouteState", () => {
    it("returns route state when found", async () => {
      mocks.getRouteStateAccount.mockResolvedValue({ status: "active" });

      const result = await caller.getRouteState({ routeId: 1 });

      expect(result.success).toBe(true);
    });

    it("returns success=false when not found", async () => {
      mocks.getRouteStateAccount.mockResolvedValue(null);

      const result = await caller.getRouteState({ routeId: 999 });

      expect(result.success).toBe(false);
    });
  });

  describe("getExecutorInfo", () => {
    it("returns executor public key", async () => {
      const result = await caller.getExecutorInfo({ routeId: 1 });

      expect(result.success).toBe(true);
      expect(result.data.publicKey).toBe("executor-pubkey");
    });
  });

  describe("getExecutorBalance", () => {
    it("returns balance in lamports and SOL", async () => {
      mocks.balance.mockResolvedValue({
        toNumber: () => 1_000_000_000,
        toString: () => "1000000000",
      });

      const result = await caller.getExecutorBalance({ routeId: 1 });

      expect(result.success).toBe(true);
      expect(result.data.balance).toBe("1000000000");
      expect(result.data.balanceSOL).toBe("1.000000000");
    });
  });

  describe("withdrawOnBehalf", () => {
    it("returns signature on success", async () => {
      mocks.withdrawOnBehalf.mockResolvedValue("tx-signature");
      mocks.getRouteConfiguration.mockResolvedValue({
        routeId: "1",
        creator: CREATOR,
        sourceOwner: RECIPIENT,
        executor: "executor-pubkey",
        hops: [],
        hopAmount: "500000",
        isFinalized: true,
        createdAt: "0",
      });

      const result = await caller.withdrawOnBehalf({
        routeId: 1,
        to: RECIPIENT,
        amount: "500000",
      });

      expect(result.success).toBe(true);
      expect(result.data.signature).toBe("tx-signature");
      expect(mocks.withdrawOnBehalf).toHaveBeenCalledWith(1, RECIPIENT, expect.any(Object));
    });

    it("rejects withdrawals to a non-owner destination", async () => {
      mocks.getRouteConfiguration.mockResolvedValue({
        routeId: "1",
        creator: CREATOR,
        sourceOwner: CREATOR,
        executor: "executor-pubkey",
        hops: [],
        hopAmount: "500000",
        isFinalized: true,
        createdAt: "0",
      });

      await expect(
        caller.withdrawOnBehalf({
          routeId: 1,
          to: RECIPIENT,
          amount: "500000",
        })
      ).rejects.toThrow("Withdraw destination must match the route owner");
    });
  });

  describe("triggerHop", () => {
    it("returns signature on success", async () => {
      mocks.executeHop.mockResolvedValue("hop-signature");

      const result = await caller.triggerHop({
        routeId: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data.signature).toBe("hop-signature");
    });

    it("throws on failure", async () => {
      mocks.executeHop.mockRejectedValue(new Error("hop failed"));

      await expect(
        caller.triggerHop({
          routeId: 1,
        })
      ).rejects.toThrow("hop failed");
    });
  });

  describe("estimateDeploymentCost", () => {
    const makeEstimate = (overrides: Record<string, unknown> = {}) => ({
      executorFunding: 20_000_000,
      transactionFees: 615_000,
      accountRent: 25_000_000,
      flatFeeLamports: 10_000,
      infrastructureCostLamports: 45_625_000,
      routeFees: { percentageFee: 5_000 },
      totalCostLamports: 45_625_000,
      breakdown: {
        executorFundingSOL: "0.020000",
        transactionFeesSOL: "0.000615",
        accountRentSOL: "0.025000",
        flatFeeSOL: "0.000010",
        infrastructureCostSOL: "0.045625",
        totalCostSOL: "0.045625",
      },
      ...overrides,
    });

    it("SOL: returns infrastructure totalCost (incl. flat fee) and passes type through", async () => {
      mocks.getTokenConfigSOL.mockResolvedValue({
        feeBps: 50,
        flatFeeLamports: 10000,
      });
      mocks.estimateDeploymentCost.mockReturnValue(
        makeEstimate({
          routeFees: {
            percentageFee: Math.floor((1_000_000 * 50) / 10000),
          },
        }),
      );

      const result = await caller.estimateDeploymentCost({
        hopCount: 3,
        amountLamports: 1_000_000,
        type: "SOL",
      });

      expect(mocks.getTokenConfigSOL).toHaveBeenCalled();
      expect(mocks.getTokenConfigSPL).not.toHaveBeenCalled();
      // Function was called with the type argument
      expect(mocks.estimateDeploymentCost).toHaveBeenCalledWith(
        3,
        1_000_000,
        "SOL",
        50,
        10000,
      );
      expect(result.success).toBe(true);
      // totalCost alias for current frontend
      expect(result.data.totalCost).toBe(45_625_000);
      expect(result.data.totalCostLamports).toBe(45_625_000);
      expect(result.data.flatFeeLamports).toBe(10000); // top-level lamport field (default)
      expect(result.data.routeFees.percentageFee).toBe(5_000);
      // routeFees no longer carries flatFee
      expect((result.data.routeFees as any).flatFee).toBeUndefined();
      expect(result.data.hopCount).toBe(3);
    });

    it("flatFee regression: configured flatFeeLamports inflates totalCostLamports", async () => {
      const LARGE_FLAT = 50_000_000;
      mocks.getTokenConfigSOL.mockResolvedValue({
        feeBps: 50,
        flatFeeLamports: LARGE_FLAT,
      });
      mocks.estimateDeploymentCost.mockImplementation(
        (
          _hopCount: number,
          _amountBaseUnits: number,
          _tokenType: "SOL" | "SPL",
          _feeBps: number,
          flatFeeLamports: number,
        ) =>
          makeEstimate({
            flatFeeLamports,
            // 45_615_000 was infra without flat fee; default makeEstimate has
            // flatFeeLamports=10_000 baked in. Recompute properly:
            infrastructureCostLamports: 45_615_000 + flatFeeLamports,
            totalCostLamports: 45_615_000 + flatFeeLamports,
            breakdown: {
              executorFundingSOL: "0.020000",
              transactionFeesSOL: "0.000615",
              accountRentSOL: "0.025000",
              flatFeeSOL: (flatFeeLamports / 1_000_000_000).toFixed(6),
              infrastructureCostSOL: (
                (45_615_000 + flatFeeLamports) /
                1_000_000_000
              ).toFixed(6),
              totalCostSOL: (
                (45_615_000 + flatFeeLamports) /
                1_000_000_000
              ).toFixed(6),
            },
          }),
      );

      const result = await caller.estimateDeploymentCost({
        hopCount: 3,
        amountLamports: 1_000_000,
        type: "SOL",
      });

      expect(result.data.totalCostLamports).toBe(45_615_000 + LARGE_FLAT);
      expect(result.data.flatFeeLamports).toBe(LARGE_FLAT);
    });

    it("SPL: calls getTokenConfigSPL and totalCostLamports does not depend on amount", async () => {
      mocks.getTokenConfigSPL.mockResolvedValue({
        feeBps: 50,
        flatFeeLamports: 10000,
      });
      mocks.estimateDeploymentCost.mockImplementation(
        (
          _hopCount: number,
          amountBaseUnits: number,
          _tokenType: "SOL" | "SPL",
          feeBps: number,
          _flatFeeLamports: number,
        ) =>
          makeEstimate({
            routeFees: {
              percentageFee: Math.floor((amountBaseUnits * feeBps) / 10000),
            },
          }),
      );

      const small = await caller.estimateDeploymentCost({
        hopCount: 5,
        amountLamports: 1_000,
        type: "SPL",
      });
      const huge = await caller.estimateDeploymentCost({
        hopCount: 5,
        amountLamports: 1_000_000_000_000,
        type: "SPL",
      });

      expect(mocks.getTokenConfigSPL).toHaveBeenCalled();
      // totalCostLamports is identical regardless of amount
      expect(small.data.totalCostLamports).toBe(huge.data.totalCostLamports);
      expect(small.data.totalCost).toBe(huge.data.totalCost);
      // routeFees.percentageFee is in SPL base units and DOES depend on amount
      expect(small.data.routeFees.percentageFee).toBe(
        Math.floor((1_000 * 50) / 10000),
      );
      expect(huge.data.routeFees.percentageFee).toBe(
        Math.floor((1_000_000_000_000 * 50) / 10000),
      );
      // flatFeeLamports is in lamports for SPL too
      expect(small.data.flatFeeLamports).toBe(10_000);
      expect(huge.data.type).toBe("SPL");
    });

    it("uses defaults when token config fetch fails", async () => {
      mocks.getTokenConfigSOL.mockRejectedValue(new Error("no config"));
      mocks.estimateDeploymentCost.mockReturnValue(makeEstimate());

      const result = await caller.estimateDeploymentCost({
        hopCount: 3,
        amountLamports: 1_000_000,
        type: "SOL",
      });

      expect(result.success).toBe(true);
      expect(result.data.feeBps).toBe(50); // default
      expect(result.data.flatFeeLamports).toBe(10000); // default
      // Type still forwarded to the function despite the config failure
      expect(mocks.estimateDeploymentCost).toHaveBeenCalledWith(
        3,
        1_000_000,
        "SOL",
        50,
        10000,
      );
    });
  });
});
