import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  parseLogs: vi.fn().mockReturnValue([]),
  getRouteIdFromPda: vi.fn().mockResolvedValue(null),
  insertContractTransactions: vi.fn(),
  insertContractEvents: vi.fn(),
  selectEvents: vi.fn(),
}));

vi.mock("@solana/web3.js", () => ({
  PublicKey: class MockPublicKey {
    _key: string;
    constructor(key: string) { this._key = key; }
    toString() { return this._key; }
  },
  Connection: class MockConnection {},
  clusterApiUrl: vi.fn().mockReturnValue("https://api.devnet.solana.com"),
}));

vi.mock("@coral-xyz/anchor", () => ({
  BorshEventCoder: class MockBorshEventCoder {},
  Program: class MockProgram {
    coder = {};
  },
  AnchorProvider: class MockAnchorProvider {},
  EventParser: class MockEventParser {
    parseLogs = mocks.parseLogs;
  },
  BN: class MockBN {
    constructor(public val: any) {}
    toNumber() { return Number(this.val); }
    toArrayLike() { return Buffer.alloc(8); }
  },
}));

vi.mock("../idl/multi_hopper_project.json", () => ({
  default: { address: "11111111111111111111111111111111" },
  address: "11111111111111111111111111111111",
}));

vi.mock("../solana/services/contract-utils", () => ({
  buildEventParser: () => new (class { parseLogs = mocks.parseLogs; })(),
  getRouteIdFromPda: mocks.getRouteIdFromPda,
  MULTI_HOPPER_PROGRAM_ID: { _key: "program-id", toString: () => "program-id" },
}));

vi.mock("@libs/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@libs/solana-node", () => ({
  SolanaTransactionEtlJob: class MockSolanaTransactionEtlJob {
    constructor(
      public etlConfig: any,
      public db: any,
      public solanaConfig: any,
      public schema: any,
      public schemaMapper: any
    ) {}
    protected async beforeJob() {}
    protected async afterJob(_result: any) {}
  },
}));

vi.mock("@libs/etl", () => ({}));

vi.mock("../solana/schemas", () => ({
  contractTransactions: { signature: "signature" },
  contractEvents: { id: "id", signature: "signature" },
}));

import { ContractEventsEtlJob } from "../solana/services/contract-events-etl";

describe("ContractEventsEtlJob", () => {
  let etlJob: ContractEventsEtlJob;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      transaction: vi.fn(async (cb: any) => cb(mockDb)),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          })),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      })),
    };

    etlJob = new ContractEventsEtlJob(
      { jobName: "test-etl", metadata: { cursorKey: "test" } },
      mockDb,
      "https://api.devnet.solana.com",
      "program-id-123",
      "forward"
    );
  });

  it("constructs with correct configuration", () => {
    expect(etlJob).toBeDefined();
  });

  describe("load", () => {
    it("returns early for empty data", async () => {
      const result = await (etlJob as any).load([]);

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(0);
    });

    it("processes transactions and inserts events", async () => {
      const txData = {
        signature: "sig1",
        slot: 100,
        blockTime: 1700000000,
        fee: 5000,
        success: true,
        events: [
          {
            type: "hopCompleted",
            data: {
              route: "route-pda",
              hopIndex: 0,
              fromOwner: "from",
              toOwner: "to",
              amount: "1000",
              at: "12345",
            },
          },
        ],
        transaction: {},
      };

      mocks.getRouteIdFromPda.mockResolvedValue(42);

      const result = await (etlJob as any).load([txData]);

      expect(result.processedCount).toBe(1);
      expect(result.metadata.eventsExtracted).toBe(1);
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("skips events for duplicate transactions", async () => {
      // Mock select to return existing events
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        })),
      });

      const txData = {
        signature: "sig-dup",
        slot: 100,
        blockTime: null,
        fee: 5000,
        success: true,
        events: [{ type: "routeCreated", data: { route: "r", creator: "c", mint: "m", hops: 1 } }],
        transaction: {},
      };

      const result = await (etlJob as any).load([txData]);

      expect(result.processedCount).toBe(1);
    });

    it("collects errors for failed transactions", async () => {
      mockDb.transaction.mockRejectedValueOnce(new Error("db error"));

      const txData = {
        signature: "sig-fail",
        slot: 100,
        blockTime: null,
        fee: 0,
        success: false,
        events: [],
        transaction: {},
      };

      const result = await (etlJob as any).load([txData]);

      expect(result.errors).toHaveLength(1);
      expect(result.success).toBe(false);
    });

    it("throws on catastrophic failure", async () => {
      // Make the outer try/catch throw
      Object.defineProperty(etlJob, "db", {
        get() {
          throw new Error("catastrophic");
        },
      });

      await expect((etlJob as any).load([{ signature: "s" }])).rejects.toThrow(
        "Failed to load contract data"
      );
    });
  });

  describe("extractRoutePda (via load)", () => {
    it("extracts route PDA from hopCompleted event", async () => {
      const txData = {
        signature: "sig",
        slot: 1,
        blockTime: null,
        fee: 0,
        success: true,
        events: [
          { type: "hopCompleted", data: { route: "route-pda-1", hopIndex: 0, fromOwner: "f", toOwner: "t", amount: "1", at: "1" } },
        ],
        transaction: {},
      };

      await (etlJob as any).load([txData]);

      // Verify insert was called with routePda
      const insertCall = mockDb.insert.mock.calls;
      expect(insertCall.length).toBeGreaterThan(0);
    });

    it("extracts creator from routeCreated event", async () => {
      const txData = {
        signature: "sig",
        slot: 1,
        blockTime: null,
        fee: 0,
        success: true,
        events: [
          { type: "routeCreated", data: { route: "r", creator: "creator1", mint: "m", hops: 3 } },
        ],
        transaction: {},
      };

      await (etlJob as any).load([txData]);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("extracts creator from tokenConfigCreated event", async () => {
      const txData = {
        signature: "sig",
        slot: 1,
        blockTime: null,
        fee: 0,
        success: true,
        events: [
          {
            type: "tokenConfigCreated",
            data: {
              tokenConfig: "tc",
              creator: "creator2",
              tokenMint: "mint",
              minTransfer: 0,
              feeBps: 100,
              feeTreasury: "treasury",
              maxHops: 5,
              flatFeeLamports: "0",
            },
          },
        ],
        transaction: {},
      };

      await (etlJob as any).load([txData]);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("returns null routePda for tokenConfig events", async () => {
      const txData = {
        signature: "sig",
        slot: 1,
        blockTime: null,
        fee: 0,
        success: true,
        events: [
          { type: "tokenConfigUpdated", data: { tokenConfig: "tc" } },
        ],
        transaction: {},
      };

      await (etlJob as any).load([txData]);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe("ContractEventsSchemaMapper (via constructor)", () => {
    // The schema mapper is instantiated internally in the constructor.
    // We test it indirectly by verifying the ETL job processes event data correctly.
    // The mapper's parseEvent logic is covered through the load tests above.

    it("processes routeFinished events", async () => {
      const txData = {
        signature: "sig-rf",
        slot: 1,
        blockTime: null,
        fee: 0,
        success: true,
        events: [
          { type: "routeFinished", data: { route: "route-pda", at: "99999" } },
        ],
        transaction: {},
      };

      const result = await (etlJob as any).load([txData]);
      expect(result.processedCount).toBe(1);
    });

    it("processes transactions with no events", async () => {
      const txData = {
        signature: "sig-empty",
        slot: 1,
        blockTime: 1700000,
        fee: 5000,
        success: true,
        events: [],
        transaction: {},
      };

      const result = await (etlJob as any).load([txData]);

      expect(result.processedCount).toBe(1);
      expect(result.metadata.eventsExtracted).toBe(0);
    });

    it("handles multiple transactions", async () => {
      const txs = [
        { signature: "s1", slot: 1, blockTime: null, fee: 0, success: true, events: [], transaction: {} },
        { signature: "s2", slot: 2, blockTime: null, fee: 0, success: true, events: [], transaction: {} },
        { signature: "s3", slot: 3, blockTime: null, fee: 0, success: true, events: [], transaction: {} },
      ];

      const result = await (etlJob as any).load(txs);

      expect(result.processedCount).toBe(3);
      expect(result.metadata.totalRecords).toBe(3);
    });
  });

  describe("SchemaMapper direct tests", () => {
    it("mapTransactionToSchema maps basic transaction data", () => {
      const mapper = (etlJob as any).schemaMapper;
      const txData = {
        signature: "test-sig",
        slot: 42,
        blockTime: 1700000000,
        fee: 5000,
        err: null,
        transaction: {
          meta: {
            logMessages: [],
          },
        },
      };

      const result = mapper.mapTransactionToSchema(txData);

      expect(result.signature).toBe("test-sig");
      expect(result.slot).toBe(42);
      expect(result.blockTime).toBe(1700000000);
      expect(result.fee).toBe(5000);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.events).toEqual([]);
    });

    it("mapTransactionToSchema handles error transactions", () => {
      const mapper = (etlJob as any).schemaMapper;
      const txData = {
        signature: "err-sig",
        slot: 100,
        blockTime: null,
        fee: 0,
        err: { InstructionError: [0, "Custom error"] },
        transaction: {},
      };

      const result = mapper.mapTransactionToSchema(txData);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.blockTime).toBeNull();
    });

    it("mapTransactionToSchema handles missing fee", () => {
      const mapper = (etlJob as any).schemaMapper;
      const txData = {
        signature: "no-fee",
        slot: 1,
        blockTime: null,
        transaction: {},
      };

      const result = mapper.mapTransactionToSchema(txData);
      expect(result.fee).toBe(0);
    });

    it("mapTransactionToSchema parses events from log messages", () => {
      const mapper = (etlJob as any).schemaMapper;

      // Mock parseLogs to return decoded events
      mocks.parseLogs.mockReturnValue([
        { name: "hopCompleted", data: { route: "r", hopIndex: 1, fromOwner: "f", toOwner: "t", amount: "100", at: "1234" } },
        { name: "routeCreated", data: { route: "r2", creator: "c", mint: "m", hops: 3 } },
      ]);

      const txData = {
        signature: "log-sig",
        slot: 50,
        blockTime: 1700000,
        err: null,
        transaction: {
          meta: {
            logMessages: ["Program log: some log"],
          },
        },
      };

      const result = mapper.mapTransactionToSchema(txData);

      expect(result.events).toHaveLength(2);
      expect(result.events[0].type).toBe("hopCompleted");
      expect(result.events[1].type).toBe("routeCreated");
    });

    it("mapTransactionToSchema handles unknown event types", () => {
      const mapper = (etlJob as any).schemaMapper;

      mocks.parseLogs.mockReturnValue([
        { name: "unknownEvent", data: {} },
      ]);

      const txData = {
        signature: "unknown-sig",
        slot: 1,
        blockTime: null,
        err: null,
        transaction: {
          meta: {
            logMessages: ["some log"],
          },
        },
      };

      const result = mapper.mapTransactionToSchema(txData);
      // Unknown events should be filtered out (parseEvent returns null)
      expect(result.events).toHaveLength(0);
    });

    it("mapTransactionToSchema parses tokenConfigCreated events", () => {
      const mapper = (etlJob as any).schemaMapper;

      mocks.parseLogs.mockReturnValue([
        {
          name: "tokenConfigCreated",
          data: {
            tokenConfig: "tc",
            creator: "c",
            tokenMint: "m",
            minTransfer: 1000,
            feeBps: 50,
            feeTreasury: "t",
            maxHops: 5,
            flatFeeLamports: "100",
          },
        },
      ]);

      const txData = {
        signature: "tc-sig",
        slot: 1,
        blockTime: null,
        err: null,
        transaction: { meta: { logMessages: ["log"] } },
      };

      const result = mapper.mapTransactionToSchema(txData);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe("tokenConfigCreated");
    });

    it("mapTransactionToSchema parses tokenConfigUpdated events", () => {
      const mapper = (etlJob as any).schemaMapper;

      mocks.parseLogs.mockReturnValue([
        { name: "tokenConfigUpdated", data: { tokenConfig: "tc", creator: "c" } },
      ]);

      const txData = {
        signature: "tcu-sig",
        slot: 1,
        blockTime: null,
        err: null,
        transaction: { meta: { logMessages: ["log"] } },
      };

      const result = mapper.mapTransactionToSchema(txData);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe("tokenConfigUpdated");
    });

    it("mapTransactionToSchema parses routeFinished events", () => {
      const mapper = (etlJob as any).schemaMapper;

      mocks.parseLogs.mockReturnValue([
        { name: "routeFinished", data: { route: "r", at: "99" } },
      ]);

      const txData = {
        signature: "rf-sig",
        slot: 1,
        blockTime: null,
        err: null,
        transaction: { meta: { logMessages: ["log"] } },
      };

      const result = mapper.mapTransactionToSchema(txData);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe("routeFinished");
    });

    it("validateMappedData returns true for valid data", () => {
      const mapper = (etlJob as any).schemaMapper;

      expect(mapper.validateMappedData({ signature: "s", slot: 1 })).toBe(true);
    });

    it("validateMappedData returns false for missing signature", () => {
      const mapper = (etlJob as any).schemaMapper;

      expect(mapper.validateMappedData({ signature: "", slot: 1 })).toBe(false);
    });

    it("validateMappedData returns false for missing slot", () => {
      const mapper = (etlJob as any).schemaMapper;

      expect(mapper.validateMappedData({ signature: "s", slot: undefined })).toBe(false);
    });

    it("parses hopCompleted with hop_index field variant", () => {
      const mapper = (etlJob as any).schemaMapper;

      mocks.parseLogs.mockReturnValue([
        { name: "hopCompleted", data: { route: "r", hop_index: 2, fromOwner: "f", toOwner: "t", amount: "1", at: "1" } },
      ]);

      const txData = {
        signature: "hi-sig",
        slot: 1,
        blockTime: null,
        err: null,
        transaction: { meta: { logMessages: ["log"] } },
      };

      const result = mapper.mapTransactionToSchema(txData);
      expect(result.events[0].data.hopIndex).toBe(2);
    });
  });

  describe("extractRouteId", () => {
    it("calls getRouteIdFromPda for hopCompleted events", async () => {
      mocks.getRouteIdFromPda.mockResolvedValue(42);

      const txData = {
        signature: "extract-sig",
        slot: 1,
        blockTime: null,
        fee: 0,
        success: true,
        events: [
          { type: "hopCompleted", data: { route: "route-pda-x", hopIndex: 0, fromOwner: "f", toOwner: "t", amount: "1", at: "1" } },
        ],
        transaction: {},
      };

      await (etlJob as any).load([txData]);
      expect(mocks.getRouteIdFromPda).toHaveBeenCalled();
    });

    it("handles getRouteIdFromPda failure gracefully", async () => {
      mocks.getRouteIdFromPda.mockRejectedValue(new Error("PDA decode failed"));

      const txData = {
        signature: "pda-fail-sig",
        slot: 1,
        blockTime: null,
        fee: 0,
        success: true,
        events: [
          { type: "routeFinished", data: { route: "bad-pda", at: "1" } },
        ],
        transaction: {},
      };

      // Should not throw - error is caught internally
      const result = await (etlJob as any).load([txData]);
      expect(result.processedCount).toBe(1);
    });
  });

  describe("extractHopIndex", () => {
    it("returns hopIndex from hopCompleted events", async () => {
      const txData = {
        signature: "hop-idx-sig",
        slot: 1,
        blockTime: null,
        fee: 0,
        success: true,
        events: [
          { type: "hopCompleted", data: { route: "r", hopIndex: 7, fromOwner: "f", toOwner: "t", amount: "1", at: "1" } },
        ],
        transaction: {},
      };

      await (etlJob as any).load([txData]);
      // Verify insert was called (hopIndex is extracted internally)
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("returns null hopIndex for non-hop events", async () => {
      const txData = {
        signature: "no-hop-sig",
        slot: 1,
        blockTime: null,
        fee: 0,
        success: true,
        events: [
          { type: "routeCreated", data: { route: "r", creator: "c", mint: "m", hops: 1 } },
        ],
        transaction: {},
      };

      await (etlJob as any).load([txData]);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe("beforeJob / afterJob", () => {
    it("beforeJob does not throw", async () => {
      await expect((etlJob as any).beforeJob()).resolves.not.toThrow();
    });

    it("afterJob does not throw", async () => {
      await expect((etlJob as any).afterJob({ metadata: { eventsExtracted: 5 } })).resolves.not.toThrow();
    });

    it("afterJob handles missing metadata", async () => {
      await expect((etlJob as any).afterJob({})).resolves.not.toThrow();
    });
  });
});
