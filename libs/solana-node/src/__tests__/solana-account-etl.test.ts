import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getParsedProgramAccounts: vi.fn().mockResolvedValue([]),
  getParsedAccountInfo: vi.fn().mockResolvedValue({ value: null }),
  getSlot: vi.fn().mockResolvedValue(12345),
  getCursor: vi.fn().mockResolvedValue(null),
  updateCursor: vi.fn().mockResolvedValue(undefined),
  deleteCursor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@solana/web3.js", () => ({
  Connection: class MockConnection {
    constructor() {}
    getParsedProgramAccounts = mocks.getParsedProgramAccounts;
    getParsedAccountInfo = mocks.getParsedAccountInfo;
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

vi.mock("@libs/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { SolanaAccountEtlJob } from "../etl/solana-account-etl";

function createMockDb() {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
        orderBy: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  };
}

function createMockMapper() {
  return {
    mapAccountToSchema: vi.fn((acct: any) => ({
      address: acct.address,
      lamports: acct.lamports,
      owner: acct.owner,
    })),
    validateMappedData: vi.fn(() => true),
  };
}

describe("SolanaAccountEtlJob", () => {
  let etlJob: SolanaAccountEtlJob;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockMapper: ReturnType<typeof createMockMapper>;
  const mockTable = {
    address: "address",
    lamports: "lamports",
    owner: "owner",
    executable: "executable",
    rentEpoch: "rentEpoch",
    space: "space",
    slot: "slot",
    _: { name: "test_accounts" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    mockMapper = createMockMapper();

    etlJob = new SolanaAccountEtlJob(
      { jobName: "test-acct-etl", batchSize: 100, maxRetries: 1, retryDelay: 0, timeout: 5000 },
      mockDb as any,
      {
        rpcUrl: "https://api.devnet.solana.com",
        type: "accounts",
        programId: "program-123",
        delayMs: 0,
      },
      mockTable,
      mockMapper as any
    );
  });

  describe("constructor", () => {
    it("creates an instance with defaults", () => {
      expect(etlJob).toBeDefined();
    });
  });

  describe("extract", () => {
    it("extracts program accounts", async () => {
      mocks.getParsedProgramAccounts.mockResolvedValue([
        {
          pubkey: { toString: () => "acct1" },
          account: {
            lamports: 1000000,
            owner: { toString: () => "program-123" },
            executable: false,
            rentEpoch: 100,
            data: { parsed: { info: { decimals: 6 } } },
          },
        },
      ]);

      const result = await (etlJob as any).extract();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].address).toBe("acct1");
      expect(result.data[0].lamports).toBe(1000000);
      expect(result.hasMore).toBe(false);
    });

    it("returns empty for no accounts", async () => {
      mocks.getParsedProgramAccounts.mockResolvedValue([]);

      const result = await (etlJob as any).extract();

      expect(result.data).toHaveLength(0);
    });

    it("extracts specific account by address", async () => {
      const job = new SolanaAccountEtlJob(
        { jobName: "specific-acct" },
        mockDb as any,
        {
          rpcUrl: "https://api.devnet.solana.com",
          type: "accounts",
          accountAddress: "specific-addr",
          delayMs: 0,
        },
        mockTable,
        mockMapper as any
      );

      mocks.getParsedAccountInfo.mockResolvedValue({
        value: {
          lamports: 5000,
          owner: { toString: () => "system" },
          executable: false,
          rentEpoch: 50,
          data: { parsed: { info: {} } },
        },
      });

      const result = await (job as any).extract();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].address).toBe("specific-addr");
    });

    it("returns empty when specific account not found", async () => {
      const job = new SolanaAccountEtlJob(
        { jobName: "missing-acct" },
        mockDb as any,
        { rpcUrl: "https://rpc", type: "accounts", accountAddress: "missing", delayMs: 0 },
        mockTable,
        mockMapper as any
      );

      mocks.getParsedAccountInfo.mockResolvedValue({ value: null });

      const result = await (job as any).extract();

      expect(result.data).toHaveLength(0);
    });

    it("throws when no programId or accountAddress", async () => {
      const job = new SolanaAccountEtlJob(
        { jobName: "bad" },
        mockDb as any,
        { rpcUrl: "https://rpc", type: "accounts" },
        mockTable,
        mockMapper as any
      );

      await expect((job as any).extract()).rejects.toThrow("Either programId or accountAddress");
    });

    it("handles raw data (array)", async () => {
      mocks.getParsedProgramAccounts.mockResolvedValue([
        {
          pubkey: { toString: () => "raw-acct" },
          account: {
            lamports: 100,
            owner: { toString: () => "prog" },
            executable: false,
            rentEpoch: 0,
            data: [1, 2, 3],
          },
        },
      ]);

      const result = await (etlJob as any).extract();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].data).toBeDefined();
    });

    it("handles raw data (string)", async () => {
      mocks.getParsedProgramAccounts.mockResolvedValue([
        {
          pubkey: { toString: () => "str-acct" },
          account: {
            lamports: 100,
            owner: { toString: () => "prog" },
            executable: false,
            rentEpoch: 0,
            data: "base64data",
          },
        },
      ]);

      const result = await (etlJob as any).extract();

      expect(result.data[0].data).toBe("base64data");
    });

    it("skips accounts that fail to process", async () => {
      // The account data itself is bad - owner.toString() throws, but pubkey works
      // so the catch block can log properly
      mocks.getParsedProgramAccounts.mockResolvedValue([
        {
          pubkey: { toString: () => "bad-acct" },
          account: { lamports: 0, owner: { toString: () => { throw new Error("bad owner"); } }, executable: false, rentEpoch: 0, data: null },
        },
        {
          pubkey: { toString: () => "good-acct" },
          account: { lamports: 100, owner: { toString: () => "prog" }, executable: false, rentEpoch: 0, data: null },
        },
      ]);

      const result = await (etlJob as any).extract();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].address).toBe("good-acct");
    });
  });

  describe("transform", () => {
    it("transforms account data using schema mapper", async () => {
      const data = [
        { address: "a1", lamports: 100, owner: "prog" },
        { address: "a2", lamports: 200, owner: "prog" },
      ];

      const result = await (etlJob as any).transform(data);

      expect(result.data).toHaveLength(2);
      expect(result.metadata.originalCount).toBe(2);
      expect(result.metadata.transformedCount).toBe(2);
    });

    it("collects transformation errors", async () => {
      mockMapper.mapAccountToSchema.mockImplementationOnce(() => {
        throw new Error("mapping failed");
      });

      const data = [
        { address: "bad", lamports: 0 },
        { address: "good", lamports: 100 },
      ];

      const result = await (etlJob as any).transform(data);

      expect(result.data).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
    });

    it("collects validation errors", async () => {
      mockMapper.validateMappedData.mockReturnValueOnce(false);

      const result = await (etlJob as any).transform([{ address: "a" }]);

      expect(result.errors).toHaveLength(1);
    });
  });

  describe("load", () => {
    it("returns success for empty data", async () => {
      const result = await (etlJob as any).load([]);

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(0);
    });

    it("inserts data via upsert", async () => {
      const data = [
        { address: "a1", lamports: 100 },
        { address: "a2", lamports: 200 },
      ];

      const result = await (etlJob as any).load(data);

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(2);
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

      const data = [{ address: "a1", lamports: 100 }];
      const result = await (etlJob as any).load(data);

      expect(result.processedCount).toBe(1);
    });

    it("collects individual insert errors", async () => {
      mockDb.insert.mockImplementation(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(() => { throw new Error("fail"); }),
        })),
      }));

      const data = [{ address: "a1", lamports: 100 }];
      const result = await (etlJob as any).load(data);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it("handles catastrophic failure with errors", async () => {
      // Both batch and individual inserts fail
      mockDb.insert.mockImplementation(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(() => { throw new Error("catastrophic"); }),
        })),
      }));

      const result = await (etlJob as any).load([{ address: "a" }]);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.processedCount).toBe(0);
    });
  });

  describe("lifecycle hooks", () => {
    it("beforeJob connects and logs", async () => {
      mocks.getSlot.mockResolvedValue(200);
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
        totalLoaded: 3,
        duration: 50,
        errors: [],
      });
    });

    it("onError handles errors", async () => {
      await (etlJob as any).onError(new Error("test"), "extract");
      await (etlJob as any).onError(new Error("test"), "load");
    });
  });

  describe("public utility methods", () => {
    it("getCurrentSlot returns slot", async () => {
      mocks.getSlot.mockResolvedValue(54321);
      const slot = await etlJob.getCurrentSlot();
      expect(slot).toBe(54321);
    });

    it("getSolanaConfig returns a copy", () => {
      const config = etlJob.getSolanaConfig();
      expect(config.programId).toBe("program-123");
    });
  });
});
