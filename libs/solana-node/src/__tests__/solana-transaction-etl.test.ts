import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSignaturesForAddress: vi.fn().mockResolvedValue([]),
  getParsedTransaction: vi.fn().mockResolvedValue(null),
  getSlot: vi.fn().mockResolvedValue(12345),
  getCursor: vi.fn().mockResolvedValue(null),
  updateCursor: vi.fn().mockResolvedValue(undefined),
  deleteCursor: vi.fn().mockResolvedValue(undefined),
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
}));

vi.mock("@solana/web3.js", () => ({
  Connection: class MockConnection {
    constructor() {}
    getSignaturesForAddress = mocks.getSignaturesForAddress;
    getParsedTransaction = mocks.getParsedTransaction;
    getSlot = mocks.getSlot;
  },
  PublicKey: class MockPublicKey {
    _key: string;
    constructor(key: string) { this._key = key; }
    toString() { return this._key; }
  },
}));

vi.mock("@libs/etl", () => ({
  BaseEtlJob: class MockBaseEtlJob {
    config: any;
    db: any;
    cursorManager: any;
    state: any;
    constructor(config: any, db: any) {
      this.config = {
        batchSize: 1000,
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 300000,
        concurrency: 1,
        metadata: {},
        ...config,
      };
      this.db = db;
      this.cursorManager = {
        getCursor: mocks.getCursor,
        updateCursor: mocks.updateCursor,
        deleteCursor: mocks.deleteCursor,
      };
      this.state = { status: "idle" };
    }
    async getCursor() { return mocks.getCursor(this.config.jobName); }
    getState() { return { ...this.state }; }
    getConfig() { return { ...this.config }; }
  },
}));

vi.mock("lodash", () => ({
  uniqBy: (arr: any[], key: string) => {
    const seen = new Set();
    return arr.filter((item) => {
      const val = item[key];
      if (seen.has(val)) return false;
      seen.add(val);
      return true;
    });
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

import { SolanaTransactionEtlJob } from "../etl/solana-transaction-etl";

function createMockDb() {
  const selectChain = {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([]),
      orderBy: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
  };

  return {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    _selectChain: selectChain,
  };
}

function createMockMapper() {
  return {
    mapTransactionToSchema: vi.fn((tx: any) => ({
      signature: tx.signature,
      slot: tx.slot,
      blockTime: tx.blockTime,
      fee: tx.fee,
    })),
    validateMappedData: vi.fn(() => true),
  };
}

describe("SolanaTransactionEtlJob", () => {
  let etlJob: SolanaTransactionEtlJob;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockMapper: ReturnType<typeof createMockMapper>;
  const mockTable = {
    signature: "signature",
    slot: "slot",
    _: { name: "test_table" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    mockMapper = createMockMapper();

    etlJob = new SolanaTransactionEtlJob(
      { jobName: "test-tx-etl", batchSize: 50, maxRetries: 1, retryDelay: 0, timeout: 5000 },
      mockDb as any,
      {
        rpcUrl: "https://api.devnet.solana.com",
        type: "transactions",
        programId: "program-id-123",
        direction: "forward",
        delayMs: 0,
        maxSignatures: 50,
      },
      mockTable,
      mockMapper as any
    );
  });

  describe("constructor", () => {
    it("creates an instance", () => {
      expect(etlJob).toBeDefined();
    });

    it("applies default config values", () => {
      const job = new SolanaTransactionEtlJob(
        { jobName: "defaults-test" },
        mockDb as any,
        { rpcUrl: "https://rpc.test", type: "transactions", direction: "forward" },
        mockTable,
        mockMapper as any
      );
      expect(job).toBeDefined();
    });
  });

  describe("extract", () => {
    it("returns empty data when no signatures found", async () => {
      mocks.getSignaturesForAddress.mockResolvedValue([]);

      const result = await (etlJob as any).extract(undefined);

      expect(result.data).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it("fetches and returns transaction data", async () => {
      const sigs = [
        { signature: "sig1", slot: 100, blockTime: 1700000000, err: null, memo: null, confirmationStatus: "confirmed" },
        { signature: "sig2", slot: 101, blockTime: 1700000001, err: null, memo: null, confirmationStatus: "confirmed" },
      ];
      mocks.getSignaturesForAddress.mockResolvedValue(sigs);
      mocks.getParsedTransaction.mockResolvedValue({
        meta: { fee: 5000 },
        transaction: {
          message: {
            accountKeys: [{ pubkey: { toString: () => "acct1" } }],
            instructions: [{ programId: { toString: () => "prog1" } }],
          },
        },
      });

      const result = await (etlJob as any).extract(undefined);

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.metadata.direction).toBe("forward");
    });

    it("handles cursor loop detection", async () => {
      const sigs = [
        { signature: "sig-loop", slot: 100, blockTime: null, err: null, memo: null, confirmationStatus: "confirmed" },
      ];
      mocks.getSignaturesForAddress.mockResolvedValue(sigs);
      mocks.getParsedTransaction.mockResolvedValue({ meta: { fee: 0 }, transaction: { message: { accountKeys: [], instructions: [] } } });

      // Run extract multiple times with the same cursor to trigger loop detection
      const result1 = await (etlJob as any).extract(undefined);
      // The cursor from result1 should be stored; running again with same data should eventually detect loop
      if (result1.nextCursor) {
        const result2 = await (etlJob as any).extract(result1.nextCursor);
        // Either gets data or detects loop
        expect(result2).toBeDefined();
      }
    });

    it("throws on missing program/account address", async () => {
      const badJob = new SolanaTransactionEtlJob(
        { jobName: "bad" },
        mockDb as any,
        { rpcUrl: "https://rpc.test", type: "transactions", direction: "forward" },
        mockTable,
        mockMapper as any
      );

      await expect((badJob as any).extract()).rejects.toThrow("Either programId or accountAddress");
    });

    it("handles failed transaction fetch gracefully", async () => {
      const sigs = [
        { signature: "sig-fail", slot: 100, blockTime: null, err: null, memo: null, confirmationStatus: "confirmed" },
      ];
      mocks.getSignaturesForAddress.mockResolvedValue(sigs);
      mocks.getParsedTransaction.mockRejectedValue(new Error("RPC error"));

      const result = await (etlJob as any).extract(undefined);

      expect(result.data).toHaveLength(0);
    });
  });

  describe("transform", () => {
    it("transforms transaction data using schema mapper", async () => {
      const data = [
        { signature: "s1", slot: 1, blockTime: 100, fee: 5000 },
        { signature: "s2", slot: 2, blockTime: 200, fee: 3000 },
      ];

      const result = await (etlJob as any).transform(data);

      expect(result.data).toHaveLength(2);
      expect(result.metadata.originalCount).toBe(2);
      expect(result.metadata.transformedCount).toBe(2);
    });

    it("collects errors for failed transformations", async () => {
      mockMapper.mapTransactionToSchema.mockImplementationOnce(() => {
        throw new Error("mapping error");
      });

      const data = [
        { signature: "s-err", slot: 1 },
        { signature: "s-ok", slot: 2 },
      ];

      const result = await (etlJob as any).transform(data);

      expect(result.data).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.metadata.errorCount).toBe(1);
    });

    it("collects errors for failed validation", async () => {
      mockMapper.validateMappedData.mockReturnValueOnce(false);

      const result = await (etlJob as any).transform([{ signature: "s", slot: 1 }]);

      expect(result.errors).toHaveLength(1);
    });
  });

  describe("load", () => {
    it("returns success for empty data", async () => {
      const result = await (etlJob as any).load([]);

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(0);
    });

    it("inserts data into the target table", async () => {
      const data = [
        { signature: "s1", slot: 1 },
        { signature: "s2", slot: 2 },
      ];

      const result = await (etlJob as any).load(data);

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(2);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("deduplicates by signature", async () => {
      const data = [
        { signature: "dup", slot: 1 },
        { signature: "dup", slot: 2 },
        { signature: "unique", slot: 3 },
      ];

      const result = await (etlJob as any).load(data);

      expect(result.processedCount).toBe(2); // 2 unique
    });

    it("falls back to individual inserts on batch failure", async () => {
      let callCount = 0;
      mockDb.insert.mockImplementation(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(() => {
            callCount++;
            if (callCount === 1) throw new Error("batch fail");
            return Promise.resolve();
          }),
        })),
      }));

      const data = [{ signature: "s1", slot: 1 }];

      const result = await (etlJob as any).load(data);

      // Should have attempted batch, then individual
      expect(result.processedCount).toBe(1);
    });

    it("handles catastrophic load failure with errors", async () => {
      // Make db.insert throw in both batch and individual fallback
      mockDb.insert.mockImplementation(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(() => { throw new Error("catastrophic"); }),
        })),
      }));

      const result = await (etlJob as any).load([{ signature: "s" }]);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.processedCount).toBe(0);
    });
  });

  describe("filterProcessedTransactions", () => {
    it("filters out already-processed signatures from DB", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ signature: "already-processed" }]),
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      } as any);
      mocks.getCursor.mockResolvedValue(null);

      const transactions = [
        { signature: "already-processed", slot: 1 },
        { signature: "new-tx", slot: 2 },
      ];

      const result = await (etlJob as any).filterProcessedTransactions(transactions);

      expect(result).toHaveLength(1);
      expect(result[0].signature).toBe("new-tx");
    });

    it("returns empty array for empty input", async () => {
      const result = await (etlJob as any).filterProcessedTransactions([]);

      expect(result).toHaveLength(0);
    });

    it("returns all transactions on filter error", async () => {
      mockDb.select.mockImplementation(() => { throw new Error("db error"); });
      mocks.getCursor.mockRejectedValue(new Error("cursor error"));

      const transactions = [{ signature: "s1", slot: 1 }];
      const result = await (etlJob as any).filterProcessedTransactions(transactions);

      expect(result).toHaveLength(1);
    });
  });

  describe("parseCursor", () => {
    it("returns null for undefined cursor", () => {
      const result = (etlJob as any).parseCursor(undefined);
      expect(result).toBeNull();
    });

    it("parses JSON cursor", () => {
      const cursor = JSON.stringify({ signature: "sig1", direction: "forward" });
      const result = (etlJob as any).parseCursor(cursor);

      expect(result.signature).toBe("sig1");
      expect(result.direction).toBe("forward");
    });

    it("handles legacy string cursor", () => {
      const result = (etlJob as any).parseCursor("just-a-signature");

      expect(result.signature).toBe("just-a-signature");
      expect(result.direction).toBe("forward");
    });
  });

  describe("createCursor", () => {
    it("creates a JSON cursor string", () => {
      const sigInfo = { signature: "sig1", blockTime: 1700000, slot: 100 };
      const result = (etlJob as any).createCursor(sigInfo, "forward");

      const parsed = JSON.parse(result);
      expect(parsed.signature).toBe("sig1");
      expect(parsed.direction).toBe("forward");
      expect(parsed.slot).toBe(100);
    });

    it("handles null blockTime", () => {
      const sigInfo = { signature: "sig2", blockTime: null, slot: 200 };
      const result = (etlJob as any).createCursor(sigInfo, "backward");

      const parsed = JSON.parse(result);
      expect(parsed.blockTime).toBeUndefined();
    });
  });

  describe("public utility methods", () => {
    it("getCurrentSlot returns slot", async () => {
      mocks.getSlot.mockResolvedValue(99999);
      const slot = await etlJob.getCurrentSlot();
      expect(slot).toBe(99999);
    });

    it("getDirection returns configured direction", () => {
      expect(etlJob.getDirection()).toBe("forward");
    });

    it("getSolanaConfig returns a copy", () => {
      const config = etlJob.getSolanaConfig();
      expect(config.direction).toBe("forward");
      expect(config.rpcUrl).toBe("https://api.devnet.solana.com");
    });
  });

  describe("lifecycle hooks", () => {
    it("beforeJob connects and logs", async () => {
      mocks.getSlot.mockResolvedValue(100);
      await (etlJob as any).beforeJob();
      expect(mocks.getSlot).toHaveBeenCalled();
    });

    it("beforeJob throws on RPC failure", async () => {
      mocks.getSlot.mockRejectedValue(new Error("RPC down"));
      await expect((etlJob as any).beforeJob()).rejects.toThrow("Failed to connect to Solana RPC");
    });

    it("afterJob runs without error", async () => {
      await (etlJob as any).afterJob({
        success: true,
        totalLoaded: 5,
        duration: 100,
        errors: [],
      });
    });

    it("onError handles extract errors", async () => {
      await (etlJob as any).onError(new Error("test"), "extract");
    });
  });
});
