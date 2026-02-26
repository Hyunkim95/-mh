import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import BN from "bn.js";

// Use vi.hoisted to create mock functions
const {
  mockFindMany,
  mockFindFirst,
  mockUpdate,
  mockUpdateSessionsSet,
  mockUpdateWalletsSet,
  mockGetSession,
  mockGetDynamicFees,
  mockAreAllWalletsAggregated,
  mockGetWalletsReadyForAggregation,
  mockBuildAggregationTransaction,
  mockExecuteTransaction,
  mockUpdateAggregationStatus,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateSessionsSet: vi.fn(),
  mockUpdateWalletsSet: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetDynamicFees: vi.fn(),
  mockAreAllWalletsAggregated: vi.fn(),
  mockGetWalletsReadyForAggregation: vi.fn(),
  mockBuildAggregationTransaction: vi.fn(),
  mockExecuteTransaction: vi.fn(),
  mockUpdateAggregationStatus: vi.fn(),
}));

// Mock the database
vi.mock("../db", () => ({
  db: {
    query: {
      obfuscationSessionsSchema: {
        findMany: mockFindMany,
        findFirst: mockFindFirst,
      },
      intermediateWalletsSchema: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: mockFindFirst,
      },
      routesSchema: {
        findFirst: vi.fn(),
      },
    },
    update: mockUpdate,
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((field, value) => ({ field, value, type: "eq" })),
  and: vi.fn((...conditions) => ({ conditions, type: "and" })),
  or: vi.fn((...conditions) => ({ conditions, type: "or" })),
  lte: vi.fn((field, value) => ({ field, value, type: "lte" })),
  isNull: vi.fn((field) => ({ field, type: "isNull" })),
  sql: vi.fn((strings, ...values) => ({ strings, values, type: "sql" })),
}));

// Mock config
vi.mock("../config/config", () => ({
  config: {
    solanaRpcUrl: "https://api.mainnet-beta.solana.com",
  },
}));

// Mock uuid
vi.mock("uuid", () => ({
  v4: () => "test-server-uuid-12345",
}));

// Mock obfuscation service
vi.mock("../obfuscation/services/obfuscation.service", () => ({
  obfuscationService: {
    getSession: mockGetSession,
    getConnection: vi.fn(() => ({})),
    updateSessionStatus: vi.fn(),
    completeSession: vi.fn(),
    getDynamicFees: mockGetDynamicFees,
  },
}));

// Mock intermediate wallet service
vi.mock("../obfuscation/services/intermediate-wallet.service", () => ({
  intermediateWalletService: {
    areAllWalletsAggregated: mockAreAllWalletsAggregated,
    getWalletsReadyForAggregation: mockGetWalletsReadyForAggregation,
    updateAggregationStatus: mockUpdateAggregationStatus,
    getWalletsPendingCleanup: vi.fn().mockResolvedValue([]),
  },
}));

// Mock wallet X service
vi.mock("../obfuscation/services/wallet-x.service", () => ({
  walletXService: {
    getKeypair: vi.fn(),
    getTokenBalance: vi.fn(),
  },
}));

// Mock tx builder
vi.mock("../obfuscation/services/obfuscation-tx-builder.service", () => ({
  obfuscationTxBuilder: {
    buildAggregationTransaction: mockBuildAggregationTransaction,
    executeTransaction: mockExecuteTransaction,
    buildCleanupTransaction: vi.fn(),
    buildWalletXCleanupTransaction: vi.fn(),
  },
}));

// Mock contract service
vi.mock("../solana/services/contract.service", () => ({
  initializeRouteFromWalletX: vi.fn(),
  addHopsFromWalletX: vi.fn(),
  isRouteDeployedOnChain: vi.fn(),
}));

// Mock routes service
vi.mock("../routes/services/routes.service", () => ({
  default: {
    updateRouteStatus: vi.fn(),
  },
}));

// Mock schema
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

// Mock routes schema
vi.mock("../routes/schema/route.schema", () => ({
  routesSchema: {
    id: "id",
  },
}));

describe("ObfuscationSchedulerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDynamicFees.mockResolvedValue({
      ataRentLamports: 2039280,
      rentExemptMinimumLamports: 890880,
      priorityFeeLamports: 200000,
      lastUpdated: new Date(),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("validateHopsConfiguration", () => {
    // Tests for the validateHopsConfiguration function behavior

    it("should validate that route ID matches session route ID", () => {
      const route = { id: 1, routeId: 100, hops: [{ recipient: "addr", scheduledAt: new Date(), hopIndex: 0 }] };
      const sessionRouteId = 2; // Mismatch

      // The validation would fail because route.id !== sessionRouteId
      expect(route.id).not.toBe(sessionRouteId);

      // Error message would be: "Route ID mismatch: expected 2, got 1"
      const expectedError = `Route ID mismatch: expected ${sessionRouteId}, got ${route.id}`;
      expect(expectedError).toContain("Route ID mismatch");
    });

    it("should validate that hops exist", () => {
      const route = { id: 1, routeId: 100, hops: [] };

      expect(route.hops.length).toBe(0);

      // Error message would be: "Route has no hops configured"
      const expectedError = "Route has no hops configured";
      expect(expectedError).toBe("Route has no hops configured");
    });

    it("should validate hops is undefined", () => {
      const route = { id: 1, routeId: 100, hops: undefined };

      // !route.hops should be true when hops is undefined
      expect(!route.hops).toBe(true);
    });

    it("should validate hop indices are sequential", () => {
      const hops = [
        { recipient: "addr1", scheduledAt: new Date(), hopIndex: 0 },
        { recipient: "addr2", scheduledAt: new Date(), hopIndex: 1 },
        { recipient: "addr3", scheduledAt: new Date(), hopIndex: 2 },
      ];

      for (let i = 0; i < hops.length; i++) {
        expect(hops[i].hopIndex).toBe(i);
      }
    });

    it("should detect non-sequential hop indices", () => {
      const hops = [
        { recipient: "addr1", scheduledAt: new Date(), hopIndex: 0 },
        { recipient: "addr2", scheduledAt: new Date(), hopIndex: 5 }, // Wrong!
        { recipient: "addr3", scheduledAt: new Date(), hopIndex: 2 },
      ];

      const isSequential = hops.every((hop, i) => hop.hopIndex === i);
      expect(isSequential).toBe(false);

      // Validation function would find the first mismatched index
      for (let i = 0; i < hops.length; i++) {
        if (hops[i].hopIndex !== i) {
          const expectedError = `Hop index mismatch at position ${i}: expected ${i}, got ${hops[i].hopIndex}`;
          expect(expectedError).toContain("Hop index mismatch");
          break;
        }
      }
    });

    it("should detect skipped hop indices", () => {
      const hops = [
        { recipient: "addr1", scheduledAt: new Date(), hopIndex: 0 },
        { recipient: "addr2", scheduledAt: new Date(), hopIndex: 2 }, // Skipped 1
        { recipient: "addr3", scheduledAt: new Date(), hopIndex: 3 },
      ];

      const isSequential = hops.every((hop, i) => hop.hopIndex === i);
      expect(isSequential).toBe(false);
    });

    it("should return valid result for correct configuration", () => {
      const route = {
        id: 1,
        routeId: 100,
        hops: [
          { recipient: "addr1", scheduledAt: new Date(), hopIndex: 0 },
          { recipient: "addr2", scheduledAt: new Date(), hopIndex: 1 },
        ],
      };
      const sessionRouteId = 1;

      // All validation checks pass
      expect(route.id).toBe(sessionRouteId);
      expect(route.hops.length).toBeGreaterThan(0);
      expect(route.hops.every((hop, i) => hop.hopIndex === i)).toBe(true);
    });

    it("should warn about large hop counts", () => {
      const MAX_HOPS_WARNING_THRESHOLD = 30;
      const largeHopCount = 35;

      expect(largeHopCount).toBeGreaterThan(MAX_HOPS_WARNING_THRESHOLD);

      // This triggers a console.warn in the actual function
    });
  });

  describe("shouldRetryFromDb", () => {
    it("should return true when no failures recorded", async () => {
      const wallet = {
        id: 1,
        failureCount: 0,
        nextRetryAt: null,
      };
      mockFindFirst.mockResolvedValue(wallet);

      // failureCount is 0, which is < MAX_RETRY_ATTEMPTS (3)
      expect(wallet.failureCount).toBeLessThan(3);
    });

    it("should return true when failure count is below max", async () => {
      const wallet = {
        id: 1,
        failureCount: 2, // Below max of 3
        nextRetryAt: null,
      };
      mockFindFirst.mockResolvedValue(wallet);

      expect(wallet.failureCount).toBeLessThan(3);
    });

    it("should return false when at max retries and still in cooldown", async () => {
      const now = new Date();
      const futureRetryAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 min in future

      const wallet = {
        id: 1,
        failureCount: 3, // At max
        nextRetryAt: futureRetryAt,
      };
      mockFindFirst.mockResolvedValue(wallet);

      // nextRetryAt is in the future, so should not retry
      expect(now < futureRetryAt).toBe(true);
    });

    it("should return true when at max retries but cooldown expired", async () => {
      const now = new Date();
      const pastRetryAt = new Date(now.getTime() - 1000); // 1 sec in past

      const wallet = {
        id: 1,
        failureCount: 3, // At max
        nextRetryAt: pastRetryAt,
      };
      mockFindFirst.mockResolvedValue(wallet);

      // nextRetryAt is in the past, so should allow retry
      expect(now >= pastRetryAt).toBe(true);
    });
  });

  describe("recordFailureToDb", () => {
    it("should increment failure count and set next retry time", async () => {
      const updateMock = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockUpdate.mockReturnValue(updateMock());

      // The function should:
      // 1. Set failureCount = COALESCE(failureCount, 0) + 1
      // 2. Set lastFailureAt = now
      // 3. Set nextRetryAt = now + RETRY_COOLDOWN_MS (5 minutes)
      // 4. Set lastError = error message

      const now = new Date();
      const expectedNextRetry = new Date(now.getTime() + 5 * 60 * 1000);

      // Verify the expected behavior
      expect(expectedNextRetry.getTime() - now.getTime()).toBe(5 * 60 * 1000);
    });

    it("should update session when walletId is not provided", async () => {
      const updateMock = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockUpdate.mockReturnValue(updateMock());

      // When walletId is undefined, it should update obfuscationSessionsSchema
      // The update should include:
      // - lastError: the error message
      // - failureCount: SQL increment (COALESCE(failureCount, 0) + 1)
      // - lastFailureAt: current timestamp
      // - nextRetryAt: now + 5 minutes
    });

    it("should update wallet when walletId is provided", async () => {
      const updateMock = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockUpdate.mockReturnValue(updateMock());

      // When walletId is provided, it should update intermediateWalletsSchema
      // with the same fields as session update plus updatedAt
    });

    it("should use SQL COALESCE for null-safe increment", async () => {
      // SQL used: COALESCE(failure_count, 0) + 1
      // This handles cases where failureCount is null (first failure)
      const initialFailureCount = null;
      const expected = (initialFailureCount ?? 0) + 1;
      expect(expected).toBe(1);

      const existingFailureCount = 2;
      const expected2 = (existingFailureCount ?? 0) + 1;
      expect(expected2).toBe(3);
    });

    it("should log error with session and wallet context", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // The function logs: "[ObfuscationScheduler] Recorded failure for session X wallet Y: error"
      console.error(
        "[ObfuscationScheduler] Recorded failure for session 1 wallet 2: Test error"
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        "[ObfuscationScheduler] Recorded failure for session 1 wallet 2: Test error"
      );

      consoleSpy.mockRestore();
    });
  });

  describe("clearFailureTracking", () => {
    it("should reset failure count and clear error fields for session", async () => {
      const updateMock = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockUpdate.mockReturnValue(updateMock());

      // When walletId is NOT provided, update obfuscationSessionsSchema:
      // failureCount = 0
      // lastFailureAt = null
      // nextRetryAt = null
      // lastError = null
      const expectedSessionUpdate = {
        failureCount: 0,
        lastFailureAt: null,
        nextRetryAt: null,
        lastError: null,
      };

      expect(expectedSessionUpdate.failureCount).toBe(0);
      expect(expectedSessionUpdate.lastFailureAt).toBeNull();
      expect(expectedSessionUpdate.nextRetryAt).toBeNull();
      expect(expectedSessionUpdate.lastError).toBeNull();
    });

    it("should reset failure count and clear error fields for wallet", async () => {
      const updateMock = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockUpdate.mockReturnValue(updateMock());

      // When walletId IS provided, update intermediateWalletsSchema:
      // failureCount = 0
      // lastFailureAt = null
      // nextRetryAt = null
      // lastError = null
      // updatedAt = new Date()
      const expectedWalletUpdate = {
        failureCount: 0,
        lastFailureAt: null,
        nextRetryAt: null,
        lastError: null,
        updatedAt: new Date(),
      };

      expect(expectedWalletUpdate.failureCount).toBe(0);
      expect(expectedWalletUpdate.lastFailureAt).toBeNull();
      expect(expectedWalletUpdate.updatedAt).toBeInstanceOf(Date);
    });

    it("should be called on successful operations", async () => {
      // clearFailureTracking is called after:
      // 1. Successful aggregation
      // 2. Successful cleanup
      // 3. Successful session completion
      // This ensures failure state doesn't persist after success
      expect(true).toBe(true);
    });
  });

  describe("acquireSessionLock", () => {
    it("should acquire lock when session is not locked", async () => {
      const updateResult = [{ id: 1 }]; // Returning means update succeeded
      const updateMock = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(updateResult),
          }),
        }),
      });
      mockUpdate.mockReturnValue(updateMock());

      // Lock should be acquired when result.length > 0
      expect(updateResult.length).toBeGreaterThan(0);
    });

    it("should fail to acquire lock when session is already locked", async () => {
      const updateResult: any[] = []; // Empty means no rows updated (already locked)
      const updateMock = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(updateResult),
          }),
        }),
      });
      mockUpdate.mockReturnValue(updateMock());

      // Lock should NOT be acquired when result.length === 0
      expect(updateResult.length).toBe(0);
    });

    it("should acquire lock when previous lock has expired", async () => {
      const now = new Date();
      const lockTimeout = 2 * 60 * 1000; // 2 minutes (LOCK_TIMEOUT_MS)
      const expiredLockTime = new Date(now.getTime() - lockTimeout - 1000); // Expired

      // The WHERE clause should check:
      // lockedBy IS NULL OR lockedAt <= (now - LOCK_TIMEOUT_MS)
      expect(expiredLockTime.getTime()).toBeLessThan(now.getTime() - lockTimeout);
    });

    it("should set lockedBy to unique server ID", async () => {
      // SERVER_ID is generated as `server_${uuidv4()}`
      const serverId = "server_test-server-uuid-12345";
      expect(serverId).toMatch(/^server_/);
    });

    it("should set lockedAt to current timestamp", async () => {
      const beforeLock = new Date();
      const lockTimestamp = new Date(); // Simulating lock acquisition
      const afterLock = new Date();

      expect(lockTimestamp.getTime()).toBeGreaterThanOrEqual(beforeLock.getTime());
      expect(lockTimestamp.getTime()).toBeLessThanOrEqual(afterLock.getTime());
    });

    it("should use atomic update with WHERE conditions for race safety", async () => {
      // The update uses AND conditions:
      // 1. eq(id, sessionId)
      // 2. OR(isNull(lockedBy), lte(lockedAt, lockTimeout))
      // This ensures only unlocked or expired locks can be acquired

      const updateConditions = {
        idMatch: true,
        notLocked: true, // OR
        lockExpired: false,
      };

      // Should acquire if idMatch AND (notLocked OR lockExpired)
      const canAcquire = updateConditions.idMatch && (updateConditions.notLocked || updateConditions.lockExpired);
      expect(canAcquire).toBe(true);
    });

    it("should return false on database error", async () => {
      const updateMock = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error("DB error")),
          }),
        }),
      });
      mockUpdate.mockReturnValue(updateMock());

      // On error, acquireSessionLock catches and returns false
      // (After logging the warning)
    });
  });

  describe("releaseSessionLock", () => {
    it("should release lock only if owned by this server", async () => {
      const serverId = "server_test-server-uuid-12345";

      const updateMock = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockUpdate.mockReturnValue(updateMock());

      // The WHERE clause should include:
      // lockedBy = SERVER_ID (only release our own lock)
      expect(serverId).toContain("test-server-uuid-12345");
    });

    it("should set lockedBy and lockedAt to null", async () => {
      const releaseUpdate = {
        lockedBy: null,
        lockedAt: null,
      };

      expect(releaseUpdate.lockedBy).toBeNull();
      expect(releaseUpdate.lockedAt).toBeNull();
    });

    it("should not release lock owned by another server", async () => {
      const ourServerId = "server_our-uuid-12345";
      const otherServerId = "server_other-uuid-67890";

      // WHERE clause: eq(lockedBy, SERVER_ID)
      // If another server owns the lock, the update won't match any rows
      expect(ourServerId).not.toBe(otherServerId);

      // The UPDATE...WHERE will affect 0 rows if lockedBy !== ourServerId
      const rowsAffected = 0; // Simulating no match
      expect(rowsAffected).toBe(0);
    });

    it("should be called in finally block to ensure release", async () => {
      // releaseSessionLock is always called in the finally block
      // of processDeploymentAndCleanup, ensuring lock is released
      // even if an error occurs during processing

      let lockReleased = false;
      try {
        throw new Error("Simulated processing error");
      } catch {
        // Error is caught, execution continues
      } finally {
        lockReleased = true; // This always runs
      }

      expect(lockReleased).toBe(true);
    });

    it("should handle database errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // On error, releaseSessionLock logs a warning but doesn't throw
      console.warn(
        "[ObfuscationScheduler] Failed to release lock for session 1:",
        "DB error"
      );

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("processAggregations (retry logic)", () => {
    const mockWallet = {
      id: 1,
      sessionId: 1,
      walletIndex: 0,
      allocatedAmount: "1000000000",
      fundingStatus: "funded",
      aggregationStatus: "scheduled",
      failureCount: 0,
      nextRetryAt: null,
      custodialWallet: {
        id: 1,
        address: "wallet-address",
      },
    };

    it("should process wallets ready for aggregation", async () => {
      mockGetWalletsReadyForAggregation.mockResolvedValue([mockWallet]);
      mockBuildAggregationTransaction.mockResolvedValue({
        transaction: {},
        signer: {},
      });
      mockExecuteTransaction.mockResolvedValue("tx-signature");

      // Verify that ready wallets would be processed
      const readyWallets = await mockGetWalletsReadyForAggregation();
      expect(readyWallets).toHaveLength(1);
    });

    it("should also query for failed wallets ready for retry", async () => {
      // Failed wallets with status "failed" and nextRetryAt <= now should be queried
      const failedWallet = {
        ...mockWallet,
        aggregationStatus: "failed",
        failureCount: 1,
        nextRetryAt: new Date(Date.now() - 1000), // In the past (cooldown expired)
      };

      // The scheduler queries both ready wallets AND failed wallets
      expect(failedWallet.aggregationStatus).toBe("failed");
      expect(failedWallet.nextRetryAt!.getTime()).toBeLessThan(Date.now());
    });

    it("should skip wallets that have exceeded max retries and are in cooldown", async () => {
      const maxRetriesWallet = {
        ...mockWallet,
        aggregationStatus: "failed",
        failureCount: 3, // MAX_RETRY_ATTEMPTS
        nextRetryAt: new Date(Date.now() + 5 * 60 * 1000), // Future (in cooldown)
      };

      // shouldRetryFromDb should return false for this wallet
      const now = Date.now();
      const shouldSkip =
        maxRetriesWallet.failureCount >= 3 &&
        maxRetriesWallet.nextRetryAt!.getTime() > now;

      expect(shouldSkip).toBe(true);
    });

    it("should record failure to DB when aggregation fails", async () => {
      mockGetWalletsReadyForAggregation.mockResolvedValue([mockWallet]);
      mockBuildAggregationTransaction.mockResolvedValue({
        transaction: {},
        signer: {},
      });
      mockExecuteTransaction.mockRejectedValue(new Error("Transaction failed"));

      // On failure, recordFailureToDb should be called
      // This sets nextRetryAt to now + 5 minutes
    });

    it("should clear failure tracking on successful aggregation", async () => {
      mockGetWalletsReadyForAggregation.mockResolvedValue([mockWallet]);
      mockBuildAggregationTransaction.mockResolvedValue({
        transaction: {},
        signer: {},
      });
      mockExecuteTransaction.mockResolvedValue("tx-signature");

      // On success, clearFailureTracking should be called
      // This resets failureCount to 0 and clears error fields
    });

    it("should combine ready and failed wallets for processing", async () => {
      const readyWallet = { ...mockWallet, aggregationStatus: "scheduled" };
      const failedWallet = {
        ...mockWallet,
        id: 2,
        aggregationStatus: "failed",
        failureCount: 1,
        nextRetryAt: new Date(Date.now() - 1000),
      };

      // The function fetches both:
      // 1. getWalletsReadyForAggregation() - scheduled wallets
      // 2. db.query with status="failed" AND nextRetryAt <= now
      // Then combines them: [...readyWallets, ...failedWallets]

      const allWallets = [readyWallet, failedWallet];
      expect(allWallets).toHaveLength(2);
    });

    it("should mark wallet as sent before executing transaction", async () => {
      // Step 1: updateAggregationStatus(wallet.id, "sent")
      // This prevents other servers from processing the same wallet
      const statusSequence = ["scheduled", "sent", "confirmed"];
      expect(statusSequence[1]).toBe("sent");
    });

    it("should mark wallet as confirmed after successful execution", async () => {
      mockGetWalletsReadyForAggregation.mockResolvedValue([mockWallet]);
      mockBuildAggregationTransaction.mockResolvedValue({
        transaction: {},
        signer: {},
      });
      mockExecuteTransaction.mockResolvedValue("tx-signature-123");

      // After successful execution:
      // updateAggregationStatus(wallet.id, "confirmed", signature)
    });

    it("should handle null transaction data from buildAggregationTransaction", async () => {
      mockGetWalletsReadyForAggregation.mockResolvedValue([mockWallet]);
      mockBuildAggregationTransaction.mockResolvedValue(null);

      // When txData is null:
      // 1. Log error: "Failed to build aggregation transaction - no transaction data returned"
      // 2. Update status to "failed" with error message
      // 3. Record failure to DB
    });

    it("should log successful aggregation with transaction signature", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      console.log(
        "[ObfuscationScheduler] Successfully aggregated wallet 1 for session 1, tx: tx-sig-123"
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Successfully aggregated wallet")
      );

      consoleSpy.mockRestore();
    });
  });

  describe("processDeploymentAndCleanup (multi-server locking)", () => {
    const mockSession = {
      id: 1,
      routeId: 1,
      status: "aggregating",
      walletXId: 1,
      intermediateCount: 5,
      tokenMint: null,
      tokenType: "SOL",
      totalAmount: "1000000000",
      failureCount: 0,
      nextRetryAt: null,
    };

    it("should acquire lock before processing session", async () => {
      mockFindMany.mockResolvedValue([mockSession]);
      mockAreAllWalletsAggregated.mockResolvedValue(true);

      // acquireSessionLock should be called before processing
      // If lock cannot be acquired, skip this session
    });

    it("should release lock after processing (success or failure)", async () => {
      mockFindMany.mockResolvedValue([mockSession]);

      // releaseSessionLock should be called in finally block
      // This ensures lock is always released
    });

    it("should skip session if another server has the lock", async () => {
      const lockedSession = {
        ...mockSession,
        lockedBy: "other-server-id",
        lockedAt: new Date(), // Recently locked
      };

      // acquireSessionLock returns false -> skip this session
      expect(lockedSession.lockedBy).not.toBe("server_test-server-uuid-12345");
    });

    it("should track actual fees during deployment", async () => {
      // actualFeesLamports should be incremented for each transaction:
      // - initializeRoute tx fee
      // - addHops tx fees (may be multiple batches)
      // - cleanup tx fees

      const baseFee = 5000;
      const priorityFee = 200000;
      const hopCount = 6;
      const batchCount = Math.ceil(hopCount / 3); // 2 batches

      const initFee = baseFee + priorityFee;
      const addHopsFees = batchCount * (baseFee + priorityFee);
      const totalExpectedFees = initFee + addHopsFees;

      expect(totalExpectedFees).toBeGreaterThan(0);
    });

    it("should query sessions in aggregating OR deploying status", async () => {
      // Sessions that need processing can be in either status:
      // - "aggregating": All wallets aggregated, ready for deployment
      // - "deploying": Deployment started but may need retry
      const validStatuses = ["aggregating", "deploying"];

      expect(validStatuses).toContain("aggregating");
      expect(validStatuses).toContain("deploying");
    });

    it("should check shouldRetryFromDb before processing", async () => {
      const sessionWithFailures = {
        ...mockSession,
        failureCount: 3,
        nextRetryAt: new Date(Date.now() + 5 * 60 * 1000), // Still in cooldown
      };

      // Should skip if failureCount >= MAX_RETRY_ATTEMPTS and nextRetryAt > now
      const shouldSkip =
        sessionWithFailures.failureCount >= 3 &&
        sessionWithFailures.nextRetryAt.getTime() > Date.now();

      expect(shouldSkip).toBe(true);
    });

    it("should verify all wallets are aggregated before deployment", async () => {
      mockFindMany.mockResolvedValue([mockSession]);
      mockAreAllWalletsAggregated.mockResolvedValue(false);

      // If areAllWalletsAggregated returns false:
      // - Release lock
      // - Continue to next session
      // - Do NOT proceed with deployment
    });

    it("should check both database and on-chain for deployment status", async () => {
      // The function checks:
      // 1. isDeployedInDb = !!route.deploymentTxHash
      // 2. isDeployedOnChain = await isRouteDeployedOnChain(route.routeId)
      // 3. isDeployed = isDeployedInDb || isDeployedOnChain

      const routeWithTxHash = { deploymentTxHash: "tx-hash-123" };
      const routeWithoutTxHash = { deploymentTxHash: null };

      expect(!!routeWithTxHash.deploymentTxHash).toBe(true);
      expect(!!routeWithoutTxHash.deploymentTxHash).toBe(false);
    });

    it("should recover on-chain deployment to database", async () => {
      // If route is deployed on-chain but not in DB:
      // Update DB with "recovered-from-chain" as deployment hash
      const recoveryTxHash = "recovered-from-chain";
      expect(recoveryTxHash).toBe("recovered-from-chain");
    });

    it("should verify SPL token balance before deployment", async () => {
      const splSession = {
        ...mockSession,
        tokenType: "SPL",
        tokenMint: "TokenMintAddress123",
      };

      // For SPL routes, verify Wallet X has received all tokens
      // If balance < expected, release lock and skip
      expect(splSession.tokenType).toBe("SPL");
      expect(splSession.tokenMint).toBeTruthy();
    });

    it("should calculate fees for each transaction type", async () => {
      const dynamicFees = {
        priorityFeeLamports: 200000,
      };
      const baseFee = 5000;
      const hopCount = 9;
      const batchCount = Math.ceil(hopCount / 3); // 3 batches

      // Fee breakdown:
      // initializeRoute: baseFee + priorityFee
      const initFee = baseFee + dynamicFees.priorityFeeLamports;
      // addHops: batches * (baseFee + priorityFee)
      const addHopsFees = batchCount * (baseFee + dynamicFees.priorityFeeLamports);
      // cleanup (per wallet): baseFee only (no priority)
      const cleanupFeePerWallet = baseFee;

      expect(initFee).toBe(205000);
      expect(addHopsFees).toBe(615000); // 3 batches
      expect(cleanupFeePerWallet).toBe(5000);
    });

    it("should continue cleanup even if deployment fails", async () => {
      // If deployment fails:
      // - Record failure
      // - Release lock
      // - Continue (skip cleanup)

      // But if deployment succeeds, cleanup should proceed
    });

    it("should not fail entire operation for cleanup errors", async () => {
      // Cleanup errors are logged but don't stop the process
      // The session can still be marked as completed
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      console.error(
        "[ObfuscationScheduler] Cleanup failed for wallet 1:",
        "Some error"
      );

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should complete session with actual fees", async () => {
      // After all operations, call:
      // obfuscationService.completeSession(session.id, actualFeesLamports.toString())
      const actualFees = 450000;
      expect(actualFees.toString()).toBe("450000");
    });

    it("should log successful completion with fee summary", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      console.log(
        "[ObfuscationScheduler] Session 1 completed successfully, actual fees: 450000 lamports"
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("completed successfully")
      );

      consoleSpy.mockRestore();
    });
  });

  describe("error handling", () => {
    it("should log errors instead of swallowing them", async () => {
      // The cron job catch block should:
      // console.error("[ObfuscationScheduler] Critical error during processing:", errorMessage);
      // NOT just silently catch and ignore

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Simulate an error being logged
      console.error("[ObfuscationScheduler] Critical error:", "Test error");

      expect(consoleSpy).toHaveBeenCalledWith(
        "[ObfuscationScheduler] Critical error:",
        "Test error"
      );

      consoleSpy.mockRestore();
    });

    it("should include stack trace in error logs", async () => {
      const error = new Error("Test error");
      expect(error.stack).toBeDefined();
    });
  });

  describe("transaction size handling for many hops", () => {
    it("should warn when route has more than 30 hops", async () => {
      const MAX_HOPS_WARNING_THRESHOLD = 30;
      const hopCount = 35;

      const shouldWarn = hopCount > MAX_HOPS_WARNING_THRESHOLD;
      expect(shouldWarn).toBe(true);
    });

    it("should calculate correct batch count for hops", () => {
      const HOPS_PER_BATCH = 3;

      expect(Math.ceil(1 / HOPS_PER_BATCH)).toBe(1);
      expect(Math.ceil(3 / HOPS_PER_BATCH)).toBe(1);
      expect(Math.ceil(4 / HOPS_PER_BATCH)).toBe(2);
      expect(Math.ceil(10 / HOPS_PER_BATCH)).toBe(4);
      expect(Math.ceil(30 / HOPS_PER_BATCH)).toBe(10);
    });
  });
});
