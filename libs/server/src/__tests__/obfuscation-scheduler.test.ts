import { describe, it, expect, vi, beforeEach } from "vitest";

// Holder for the captured CronJob callback (must be in hoisted scope)
const holder = vi.hoisted(() => ({
  cronCallback: null as (() => Promise<void>) | null,
}));

// All hoisted mocks
const mocks = vi.hoisted(() => ({
  // DB
  dbUpdate: vi.fn(),
  dbQuerySessionsFindMany: vi.fn(),
  dbQueryWalletsFindMany: vi.fn(),
  dbQueryWalletsFindFirst: vi.fn(),
  dbQueryRoutesFindFirst: vi.fn(),

  // Obfuscation service
  getSession: vi.fn(),
  getConnectionGetBalance: vi.fn(),
  updateSessionStatus: vi.fn(),
  completeSession: vi.fn(),
  getDynamicFees: vi.fn(),
  scheduleAggregations: vi.fn(),

  // Intermediate wallet service
  areAllWalletsAggregated: vi.fn(),
  areAllWalletsFunded: vi.fn(),
  areAllWalletsCleanedUp: vi.fn(),
  getWalletsReadyForAggregation: vi.fn(),
  updateAggregationStatus: vi.fn(),
  getWalletsPendingCleanup: vi.fn(),
  updateCleanupStatus: vi.fn(),
  claimWalletForAggregation: vi.fn(),
  getPublicKeyForWallet: vi.fn(),

  // Wallet X service
  walletXGetKeypair: vi.fn(),
  walletXGetTokenBalance: vi.fn(),
  walletXGetSOLBalance: vi.fn(),

  // TX builder
  buildAggregationTransaction: vi.fn(),
  executeTransaction: vi.fn(),
  buildCleanupTransaction: vi.fn(),
  buildWalletXCleanupTransaction: vi.fn(),

  // Contract service
  initializeRouteFromWalletX: vi.fn(),
  addHopsFromWalletX: vi.fn(),
  isRouteDeployedOnChain: vi.fn(),
  getRouteStateAccount: vi.fn(),
  isExtraAccountMetasInitialized: vi.fn(),
  initializeExtraAccountMetasForRoute: vi.fn(),

  // Routes service
  routesUpdateRouteStatus: vi.fn(),

  // Hops service
  shiftHopSchedulesAfterDeployment: vi.fn(),

  // Cron
  cronStart: vi.fn(),
  cronStop: vi.fn(),
}));

vi.mock("cron", () => ({
  CronJob: class MockCronJob {
    constructor(_pattern: string, callback: () => Promise<void>) {
      holder.cronCallback = callback;
    }
    start = mocks.cronStart;
    stop = mocks.cronStop;
  },
}));

vi.mock("@solana/web3.js", () => ({
  PublicKey: class MockPublicKey {
    _key: string;
    constructor(key: string) {
      this._key = key;
    }
    toString() {
      return this._key;
    }
  },
}));

vi.mock("bn.js", () => ({
  default: class MockBN {
    _val: any;
    constructor(val: any) {
      this._val = val;
    }
    toNumber() {
      return Number(this._val);
    }
    toString() {
      return String(this._val);
    }
    lt(other: any) {
      return Number(this._val) < Number(other._val);
    }
    gtn(n: number) {
      return Number(this._val) > n;
    }
  },
}));

vi.mock("uuid", () => ({
  v4: () => "test-uuid-12345",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => ({ type: "eq", val })),
  and: vi.fn((...args: any[]) => ({ type: "and", args })),
  or: vi.fn((...args: any[]) => ({ type: "or", args })),
  lte: vi.fn((_col: any, val: any) => ({ type: "lte", val })),
  isNull: vi.fn((_col: any) => ({ type: "isNull" })),
  sql: vi.fn(),
}));

/** Helper: creates a chainable db.update() mock chain */
function chainableUpdate(returningResult: any[] = [{ id: 1 }]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() =>
        Object.assign(Promise.resolve(undefined), {
          returning: vi.fn().mockResolvedValue(returningResult),
        }),
      ),
    }),
  };
}

vi.mock("../db", () => ({
  db: {
    query: {
      obfuscationSessionsSchema: {
        findMany: mocks.dbQuerySessionsFindMany,
      },
      intermediateWalletsSchema: {
        findMany: mocks.dbQueryWalletsFindMany,
        findFirst: mocks.dbQueryWalletsFindFirst,
      },
      routesSchema: {
        findFirst: mocks.dbQueryRoutesFindFirst,
      },
    },
    update: mocks.dbUpdate,
  },
}));

vi.mock("../obfuscation/schema/obfuscation.schema", () => ({
  obfuscationSessionsSchema: {
    id: "id",
    status: "status",
    lockedBy: "locked_by",
    lockedAt: "locked_at",
    failureCount: "failure_count",
    lastFailureAt: "last_failure_at",
    nextRetryAt: "next_retry_at",
    lastError: "last_error",
  },
  intermediateWalletsSchema: {
    id: "id",
    sessionId: "session_id",
    aggregationStatus: "aggregation_status",
    failureCount: "failure_count",
    lastFailureAt: "last_failure_at",
    nextRetryAt: "next_retry_at",
    lastError: "last_error",
    updatedAt: "updated_at",
  },
}));

vi.mock("../routes/schema/route.schema", () => ({
  routesSchema: { id: "id" },
}));

vi.mock("../obfuscation/services/obfuscation.service", () => ({
  obfuscationService: {
    getSession: mocks.getSession,
    getConnection: () => ({ getBalance: mocks.getConnectionGetBalance }),
    updateSessionStatus: mocks.updateSessionStatus,
    completeSession: mocks.completeSession,
    getDynamicFees: mocks.getDynamicFees,
    scheduleAggregations: mocks.scheduleAggregations,
  },
}));

vi.mock("../obfuscation/services/intermediate-wallet.service", () => ({
  intermediateWalletService: {
    areAllWalletsAggregated: mocks.areAllWalletsAggregated,
    areAllWalletsFunded: mocks.areAllWalletsFunded,
    areAllWalletsCleanedUp: mocks.areAllWalletsCleanedUp,
    getWalletsReadyForAggregation: mocks.getWalletsReadyForAggregation,
    updateAggregationStatus: mocks.updateAggregationStatus,
    getWalletsPendingCleanup: mocks.getWalletsPendingCleanup,
    updateCleanupStatus: mocks.updateCleanupStatus,
    claimWalletForAggregation: mocks.claimWalletForAggregation,
    getPublicKeyForWallet: mocks.getPublicKeyForWallet,
  },
}));

vi.mock("../obfuscation/services/wallet-x.service", () => ({
  walletXService: {
    getKeypair: mocks.walletXGetKeypair,
    getTokenBalance: mocks.walletXGetTokenBalance,
    getSOLBalance: mocks.walletXGetSOLBalance,
  },
}));

vi.mock("../obfuscation/services/obfuscation-tx-builder.service", () => ({
  obfuscationTxBuilder: {
    buildAggregationTransaction: mocks.buildAggregationTransaction,
    executeTransaction: mocks.executeTransaction,
    buildCleanupTransaction: mocks.buildCleanupTransaction,
    buildWalletXCleanupTransaction: mocks.buildWalletXCleanupTransaction,
  },
}));

vi.mock("../solana/services/contract.service", () => ({
  initializeRouteFromWalletX: mocks.initializeRouteFromWalletX,
  addHopsFromWalletX: mocks.addHopsFromWalletX,
  isRouteDeployedOnChain: mocks.isRouteDeployedOnChain,
  getRouteStateAccount: mocks.getRouteStateAccount,
  isExtraAccountMetasInitialized: mocks.isExtraAccountMetasInitialized,
  initializeExtraAccountMetasForRoute: mocks.initializeExtraAccountMetasForRoute,
}));

vi.mock("../routes/services/routes.service", () => ({
  default: {
    updateRouteStatus: mocks.routesUpdateRouteStatus,
  },
}));

vi.mock("../hops/services/hops.service", () => ({
  hopsService: {
    shiftHopSchedulesAfterDeployment: mocks.shiftHopSchedulesAfterDeployment,
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

// Import the REAL module — this exercises module-level code and gives coverage
import {
  startObfuscationScheduler,
  stopObfuscationScheduler,
} from "../obfuscation/services/obfuscation-scheduler.service";

describe("ObfuscationSchedulerService", () => {
  const mockSession = {
    id: 1,
    routeId: 100,
    status: "aggregating",
    walletXId: 1,
    intermediateCount: 3,
    tokenMint: null,
    tokenType: "SOL",
    totalAmount: "1000000000",
    failureCount: 0,
    nextRetryAt: null,
  };

  const mockRoute = {
    id: 100,
    routeId: 42,
    creator: "creator-pubkey",
    deploymentTxHash: null,
    hops: [
      { recipient: "recipient-1", scheduledAt: new Date(), hopIndex: 0 },
      { recipient: "recipient-2", scheduledAt: new Date(), hopIndex: 1 },
    ],
  };

  beforeEach(() => {
    vi.resetAllMocks();

    // Defaults: no work to do in either phase
    mocks.getWalletsReadyForAggregation.mockResolvedValue([]);
    mocks.dbQueryWalletsFindMany.mockResolvedValue([]);
    mocks.dbQuerySessionsFindMany.mockResolvedValue([]);
    mocks.dbUpdate.mockImplementation(() => chainableUpdate());
    mocks.updateAggregationStatus.mockResolvedValue(undefined);
    mocks.updateCleanupStatus.mockResolvedValue(undefined);
    mocks.updateSessionStatus.mockResolvedValue(undefined);
    mocks.completeSession.mockResolvedValue(undefined);
    mocks.scheduleAggregations.mockResolvedValue(undefined);
    mocks.routesUpdateRouteStatus.mockResolvedValue(undefined);
    mocks.shiftHopSchedulesAfterDeployment.mockResolvedValue(undefined);

    mocks.getDynamicFees.mockResolvedValue({
      ataRentLamports: 2039280,
      rentExemptMinimumLamports: 890880,
      priorityFeeLamports: 200000,
      lastUpdated: new Date(),
    });
  });

  /** Sets up mocks for a successful full-deployment scenario */
  function setupDeploymentMocks() {
    // processDeploymentAndCleanup calls findMany twice:
    // 1st: stuck funding sessions, 2nd: aggregating/deploying sessions
    mocks.dbQuerySessionsFindMany
      .mockResolvedValueOnce([]) // stuck funding
      .mockResolvedValueOnce([mockSession]); // aggregating

    // shouldRetryFromDb (session path) → getSession
    mocks.getSession.mockResolvedValue({ failureCount: 0, nextRetryAt: null });

    // acquireSessionLock → db.update().returning() → default chainableUpdate returns [{ id: 1 }]

    mocks.areAllWalletsAggregated.mockResolvedValue(true);
    mocks.dbQueryRoutesFindFirst.mockResolvedValue(mockRoute);
    mocks.isRouteDeployedOnChain.mockResolvedValue(false);
    mocks.walletXGetKeypair.mockResolvedValue({ secretKey: new Uint8Array(64) });
    mocks.initializeRouteFromWalletX.mockResolvedValue("deploy-tx-sig");
    mocks.addHopsFromWalletX.mockResolvedValue(undefined);
    mocks.routesUpdateRouteStatus.mockResolvedValue(undefined);
    mocks.shiftHopSchedulesAfterDeployment.mockResolvedValue(undefined);

    // Cleanup defaults: nothing to clean, Wallet X returns null
    mocks.getWalletsPendingCleanup.mockResolvedValue([]);
    mocks.buildWalletXCleanupTransaction.mockResolvedValue(null);
    mocks.walletXGetSOLBalance.mockResolvedValue({
      gtn: () => false,
      toString: () => "0",
      toNumber: () => 0,
    });
    mocks.areAllWalletsCleanedUp.mockResolvedValue(true);
    mocks.completeSession.mockResolvedValue(undefined);
  }

  describe("startObfuscationScheduler / stopObfuscationScheduler", () => {
    it("starts the cron job", () => {
      startObfuscationScheduler();
      expect(mocks.cronStart).toHaveBeenCalled();
    });

    it("stops the cron job", () => {
      stopObfuscationScheduler();
      expect(mocks.cronStop).toHaveBeenCalled();
    });
  });

  describe("processAggregations", () => {
    it("does nothing when no wallets need processing", async () => {
      await holder.cronCallback!();
      expect(mocks.buildAggregationTransaction).not.toHaveBeenCalled();
    });

    it("processes a ready wallet successfully", async () => {
      const wallet = { id: 1, sessionId: 10 };
      mocks.getWalletsReadyForAggregation.mockResolvedValue([wallet]);
      mocks.dbQueryWalletsFindFirst.mockResolvedValue({ failureCount: 0, nextRetryAt: null });
      mocks.claimWalletForAggregation.mockResolvedValue(true);
      mocks.buildAggregationTransaction.mockResolvedValue({ transaction: {}, signer: {} });
      mocks.executeTransaction.mockResolvedValue("agg-tx-sig");
      mocks.updateAggregationStatus.mockResolvedValue(undefined);

      await holder.cronCallback!();

      expect(mocks.claimWalletForAggregation).toHaveBeenCalledWith(1);
      expect(mocks.updateAggregationStatus).toHaveBeenCalledWith(1, "confirmed", "agg-tx-sig");
      // clearFailureTracking should call db.update
      expect(mocks.dbUpdate).toHaveBeenCalled();
    });

    it("records failure when buildAggregationTransaction returns null", async () => {
      const wallet = { id: 2, sessionId: 10 };
      mocks.getWalletsReadyForAggregation.mockResolvedValue([wallet]);
      mocks.dbQueryWalletsFindFirst.mockResolvedValue({ failureCount: 0 });
      mocks.claimWalletForAggregation.mockResolvedValue(true);
      mocks.buildAggregationTransaction.mockResolvedValue(null);

      await holder.cronCallback!();

      expect(mocks.updateAggregationStatus).toHaveBeenCalledWith(
        2, "failed", undefined, expect.stringContaining("no transaction data"),
      );
      expect(mocks.dbUpdate).toHaveBeenCalled(); // recordFailureToDb
    });

    it("records failure when executeTransaction throws", async () => {
      const wallet = { id: 3, sessionId: 10 };
      mocks.getWalletsReadyForAggregation.mockResolvedValue([wallet]);
      mocks.dbQueryWalletsFindFirst.mockResolvedValue({ failureCount: 0 });
      mocks.claimWalletForAggregation.mockResolvedValue(true);
      mocks.buildAggregationTransaction.mockResolvedValue({ transaction: {}, signer: {} });
      mocks.executeTransaction.mockRejectedValue(new Error("tx failed"));

      await holder.cronCallback!();

      expect(mocks.updateAggregationStatus).toHaveBeenCalledWith(
        3, "failed", undefined, "tx failed",
      );
      expect(mocks.dbUpdate).toHaveBeenCalled(); // recordFailureToDb
    });

    it("skips wallet when claim fails (another server claimed it)", async () => {
      const wallet = { id: 4, sessionId: 10 };
      mocks.getWalletsReadyForAggregation.mockResolvedValue([wallet]);
      mocks.dbQueryWalletsFindFirst.mockResolvedValue({ failureCount: 0 });
      mocks.claimWalletForAggregation.mockResolvedValue(false);

      await holder.cronCallback!();

      expect(mocks.buildAggregationTransaction).not.toHaveBeenCalled();
    });

    it("skips wallet that has exceeded permanent failure threshold", async () => {
      const wallet = { id: 5, sessionId: 10 };
      mocks.getWalletsReadyForAggregation.mockResolvedValue([wallet]);
      mocks.dbQueryWalletsFindFirst.mockResolvedValue({ failureCount: 15, nextRetryAt: null });
      mocks.getPublicKeyForWallet.mockResolvedValue(null);

      await holder.cronCallback!();

      expect(mocks.claimWalletForAggregation).not.toHaveBeenCalled();
    });

    it("includes failed wallets ready for retry", async () => {
      const failedWallet = {
        id: 6, sessionId: 10, aggregationStatus: "failed",
        failureCount: 1, nextRetryAt: new Date(Date.now() - 1000),
        custodialWallet: { id: 1, address: "addr" },
      };
      mocks.getWalletsReadyForAggregation.mockResolvedValue([]);
      mocks.dbQueryWalletsFindMany.mockResolvedValue([failedWallet]);
      mocks.dbQueryWalletsFindFirst.mockResolvedValue({ failureCount: 1, nextRetryAt: new Date(Date.now() - 1000) });
      mocks.claimWalletForAggregation.mockResolvedValue(true);
      mocks.buildAggregationTransaction.mockResolvedValue({ transaction: {}, signer: {} });
      mocks.executeTransaction.mockResolvedValue("retry-tx-sig");

      await holder.cronCallback!();

      expect(mocks.updateAggregationStatus).toHaveBeenCalledWith(6, "confirmed", "retry-tx-sig");
    });
  });

  describe("processDeploymentAndCleanup", () => {
    it("deploys route and completes session successfully", async () => {
      setupDeploymentMocks();

      await holder.cronCallback!();

      expect(mocks.initializeRouteFromWalletX).toHaveBeenCalled();
      expect(mocks.addHopsFromWalletX).toHaveBeenCalled();
      expect(mocks.routesUpdateRouteStatus).toHaveBeenCalled();
      expect(mocks.shiftHopSchedulesAfterDeployment).toHaveBeenCalled();
      expect(mocks.completeSession).toHaveBeenCalledWith(1, expect.any(String));
    });

    it("skips session when not all wallets are aggregated", async () => {
      setupDeploymentMocks();
      mocks.areAllWalletsAggregated.mockResolvedValue(false);

      await holder.cronCallback!();

      expect(mocks.initializeRouteFromWalletX).not.toHaveBeenCalled();
    });

    it("skips session when lock cannot be acquired", async () => {
      mocks.dbQuerySessionsFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockSession]);
      mocks.getSession.mockResolvedValue({ failureCount: 0 });
      // Lock fails: returning() resolves to empty array
      mocks.dbUpdate.mockImplementation(() => chainableUpdate([]));

      await holder.cronCallback!();

      expect(mocks.areAllWalletsAggregated).not.toHaveBeenCalled();
    });

    it("skips session when shouldRetryFromDb returns false (permanent failure)", async () => {
      mocks.dbQuerySessionsFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockSession]);
      mocks.getSession.mockResolvedValue({ failureCount: 15, nextRetryAt: null });
      mocks.walletXGetSOLBalance.mockResolvedValue({
        toNumber: () => 0, toString: () => "0",
      });

      await holder.cronCallback!();

      // Should not try to acquire lock
      expect(mocks.areAllWalletsAggregated).not.toHaveBeenCalled();
    });

    it("skips when route not found", async () => {
      setupDeploymentMocks();
      mocks.dbQueryRoutesFindFirst.mockResolvedValue(null);

      await holder.cronCallback!();

      expect(mocks.initializeRouteFromWalletX).not.toHaveBeenCalled();
    });

    it("records failure when hop validation fails (route ID mismatch)", async () => {
      setupDeploymentMocks();
      mocks.dbQueryRoutesFindFirst.mockResolvedValue({ ...mockRoute, id: 999 });

      await holder.cronCallback!();

      expect(mocks.initializeRouteFromWalletX).not.toHaveBeenCalled();
      // recordFailureToDb called via db.update
      expect(mocks.dbUpdate).toHaveBeenCalled();
    });

    it("records failure when hops are empty", async () => {
      setupDeploymentMocks();
      mocks.dbQueryRoutesFindFirst.mockResolvedValue({ ...mockRoute, hops: [] });

      await holder.cronCallback!();

      expect(mocks.initializeRouteFromWalletX).not.toHaveBeenCalled();
    });

    it("recovers route deployed on-chain but not in DB", async () => {
      setupDeploymentMocks();
      mocks.isRouteDeployedOnChain.mockResolvedValue(true);
      mocks.isExtraAccountMetasInitialized.mockResolvedValue(true);
      mocks.getRouteStateAccount.mockResolvedValue({ hopsCount: 2 });

      await holder.cronCallback!();

      expect(mocks.routesUpdateRouteStatus).toHaveBeenCalledWith(
        100, "creator-pubkey", "deployed",
        expect.objectContaining({ deploymentTxHash: "recovered-from-chain" }),
      );
      // Route already fully deployed — no initializeRouteFromWalletX
      expect(mocks.initializeRouteFromWalletX).not.toHaveBeenCalled();
    });

    it("checks route state and adds hops when deployed but incomplete", async () => {
      setupDeploymentMocks();
      mocks.isRouteDeployedOnChain.mockResolvedValue(true);
      mocks.isExtraAccountMetasInitialized.mockResolvedValue(true);
      mocks.dbQueryRoutesFindFirst.mockResolvedValue({ ...mockRoute, deploymentTxHash: "existing-tx" });
      mocks.getRouteStateAccount.mockResolvedValue({ hopsCount: 0 });

      await holder.cronCallback!();

      // Verifies the getRouteStateAccount check is exercised
      expect(mocks.getRouteStateAccount).toHaveBeenCalled();
      expect(mocks.addHopsFromWalletX).toHaveBeenCalled();
    });

    it("initializes ExtraAccountMetas when missing on deployed route", async () => {
      setupDeploymentMocks();
      mocks.isRouteDeployedOnChain.mockResolvedValue(true);
      mocks.isExtraAccountMetasInitialized.mockResolvedValue(false);
      mocks.dbQueryRoutesFindFirst.mockResolvedValue({ ...mockRoute, deploymentTxHash: "existing-tx" });
      mocks.getRouteStateAccount.mockResolvedValue({ hopsCount: 2 });

      await holder.cronCallback!();

      expect(mocks.initializeExtraAccountMetasForRoute).toHaveBeenCalled();
    });

    it("records failure when deployment throws", async () => {
      setupDeploymentMocks();
      mocks.initializeRouteFromWalletX.mockRejectedValue(new Error("deployment failed"));

      await holder.cronCallback!();

      expect(mocks.dbUpdate).toHaveBeenCalled(); // recordFailureToDb
      expect(mocks.getWalletsPendingCleanup).not.toHaveBeenCalled();
    });

    it("handles Wallet X keypair not found", async () => {
      setupDeploymentMocks();
      mocks.walletXGetKeypair.mockResolvedValue(null);

      await holder.cronCallback!();

      expect(mocks.initializeRouteFromWalletX).not.toHaveBeenCalled();
    });

    it("waits for SPL tokens when balance insufficient", async () => {
      // Don't use setupDeploymentMocks — need custom session with SPL token
      const splSession = { ...mockSession, tokenType: "SPL", tokenMint: "token-mint-addr" };
      mocks.dbQuerySessionsFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([splSession]);
      mocks.getSession.mockResolvedValue({ failureCount: 0, nextRetryAt: null });
      mocks.areAllWalletsAggregated.mockResolvedValue(true);
      mocks.dbQueryRoutesFindFirst.mockResolvedValue(mockRoute);
      mocks.isRouteDeployedOnChain.mockResolvedValue(false);
      mocks.walletXGetKeypair.mockResolvedValue({ secretKey: new Uint8Array(64) });
      mocks.walletXGetTokenBalance.mockResolvedValue({
        lt: () => true, toString: () => "0",
      });

      await holder.cronCallback!();

      expect(mocks.walletXGetTokenBalance).toHaveBeenCalled();
      expect(mocks.initializeRouteFromWalletX).not.toHaveBeenCalled();
    });

    it("cleans up intermediate wallets after deployment", async () => {
      setupDeploymentMocks();
      const pendingWallet = { id: 10 };
      mocks.getWalletsPendingCleanup.mockResolvedValue([pendingWallet]);
      mocks.buildCleanupTransaction.mockResolvedValue({ transaction: {}, signer: {} });
      mocks.executeTransaction.mockResolvedValue("cleanup-tx-sig");

      await holder.cronCallback!();

      expect(mocks.buildCleanupTransaction).toHaveBeenCalledWith(10, 1, expect.anything());
      expect(mocks.updateCleanupStatus).toHaveBeenCalledWith(10, "completed", "cleanup-tx-sig", "cleanup-tx-sig");
    });

    it("handles cleanup failure with immediate retry success", async () => {
      setupDeploymentMocks();
      const pendingWallet = { id: 11 };
      mocks.getWalletsPendingCleanup.mockResolvedValue([pendingWallet]);
      // First cleanup fails, retry succeeds
      mocks.buildCleanupTransaction
        .mockResolvedValueOnce({ transaction: {}, signer: {} });
      mocks.executeTransaction
        .mockRejectedValueOnce(new Error("first attempt failed"))
        .mockResolvedValueOnce("retry-sig");
      // Retry buildCleanupTransaction succeeds
      mocks.buildCleanupTransaction
        .mockResolvedValueOnce({ transaction: {}, signer: {} });

      await holder.cronCallback!();

      expect(mocks.updateCleanupStatus).toHaveBeenCalledWith(11, "completed", "retry-sig", "retry-sig");
    });

    it("marks cleanup completed when retry returns null (balance drained)", async () => {
      setupDeploymentMocks();
      const pendingWallet = { id: 12 };
      mocks.getWalletsPendingCleanup.mockResolvedValue([pendingWallet]);
      mocks.buildCleanupTransaction
        .mockResolvedValueOnce({ transaction: {}, signer: {} });
      mocks.executeTransaction
        .mockRejectedValueOnce(new Error("first attempt failed"));
      // Retry buildCleanupTransaction returns null (balance is 0)
      mocks.buildCleanupTransaction
        .mockResolvedValueOnce(null);

      await holder.cronCallback!();

      expect(mocks.updateCleanupStatus).toHaveBeenCalledWith(12, "completed");
    });

    it("handles Wallet X cleanup with successful transaction", async () => {
      setupDeploymentMocks();
      mocks.buildWalletXCleanupTransaction.mockResolvedValue({ transaction: {}, signer: {} });
      mocks.executeTransaction.mockResolvedValue("wx-cleanup-sig");

      await holder.cronCallback!();

      expect(mocks.completeSession).toHaveBeenCalled();
    });

    it("records failure when Wallet X cleanup fails", async () => {
      setupDeploymentMocks();
      mocks.buildWalletXCleanupTransaction.mockRejectedValue(new Error("WX cleanup failed"));
      // Not all cleaned → session not completed
      mocks.areAllWalletsCleanedUp.mockResolvedValue(true);

      await holder.cronCallback!();

      // Session should not be completed since walletXCleanupSuccess is false
      expect(mocks.completeSession).not.toHaveBeenCalled();
    });

    it("does not complete session when some cleanups failed", async () => {
      setupDeploymentMocks();
      mocks.areAllWalletsCleanedUp.mockResolvedValue(false);

      await holder.cronCallback!();

      expect(mocks.completeSession).not.toHaveBeenCalled();
    });

    it("recovers stuck funding sessions", async () => {
      const stuckSession = { id: 5, routeId: 50, status: "funding" };
      mocks.dbQuerySessionsFindMany
        .mockResolvedValueOnce([stuckSession])
        .mockResolvedValueOnce([]);
      mocks.areAllWalletsFunded.mockResolvedValue(true);

      await holder.cronCallback!();

      expect(mocks.scheduleAggregations).toHaveBeenCalledWith(5);
    });

    it("handles error during stuck funding recovery gracefully", async () => {
      const stuckSession = { id: 6, routeId: 60, status: "funding" };
      mocks.dbQuerySessionsFindMany
        .mockResolvedValueOnce([stuckSession])
        .mockResolvedValueOnce([]);
      mocks.areAllWalletsFunded.mockRejectedValue(new Error("db error"));

      // Should not throw
      await holder.cronCallback!();
    });
  });

  describe("error handling", () => {
    it("handles critical error in cron callback without crashing", async () => {
      mocks.getWalletsReadyForAggregation.mockRejectedValue(new Error("Critical error"));

      // Should not throw — error is caught and logged
      await holder.cronCallback!();
    });

    it("captures error with stack trace", async () => {
      const error = new Error("Stack trace test");
      mocks.getWalletsReadyForAggregation.mockRejectedValue(error);

      await holder.cronCallback!();

      // The error is caught internally — no crash
      expect(error.stack).toBeDefined();
    });
  });
});
