import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  getRouteIdFromPda: vi.fn(),
  tokenConfigsCreate: vi.fn(),
  tokenConfigsUpdate: vi.fn(),
}));

vi.mock("@solana/web3.js", () => ({
  PublicKey: class MockPublicKey {
    _key: string;
    constructor(key: string) { this._key = key; }
    toString() { return this._key; }
  },
}));

vi.mock("../solana/services/contract-utils", () => ({
  getRouteIdFromPda: mocks.getRouteIdFromPda,
  MULTI_HOPPER_PROGRAM_ID: "program-id",
}));

vi.mock("../token-configs/services/token-configs.service", () => ({
  tokenConfigsService: {
    create: mocks.tokenConfigsCreate,
    update: mocks.tokenConfigsUpdate,
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

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((_col, val) => ({ type: "eq", val })),
    and: vi.fn((...args: any[]) => ({ type: "and", args })),
    inArray: vi.fn((_col, val) => ({ type: "inArray", val })),
  };
});

import { ContractEventProcessor } from "../solana/services/contract-event-processor";

// Build a chainable mock DB
function createMockDb() {
  const mockTx: any = {};
  const updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) }));
  const selectResult: any[] = [];

  const selectChain = {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(selectResult),
        })),
        limit: vi.fn().mockResolvedValue(selectResult),
      })),
    })),
  };

  const db = {
    select: vi.fn((..._args: any[]) => selectChain),
    update: vi.fn(() => ({ set: updateSet })),
    transaction: vi.fn(async (cb: any) => cb(mockTx)),
    _selectResult: selectResult,
    _selectChain: selectChain,
    _updateSet: updateSet,
    _tx: mockTx,
  };

  // Set up tx to mirror db methods
  mockTx.select = vi.fn(() => selectChain);
  mockTx.update = vi.fn(() => ({ set: updateSet }));

  return db;
}

describe("ContractEventProcessor", () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let processor: ContractEventProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    processor = new ContractEventProcessor(mockDb as any);
  });

  describe("processUnprocessedEvents", () => {
    it("processes events and marks them as processed", async () => {
      // Set up events to return
      const events = [
        {
          id: 1,
          eventType: "routeFinished",
          signature: "sig1",
          eventData: { route: "route-pda-1", at: "68c33668" },
          routePda: "route-pda-1",
          processed: false,
        },
      ];

      // Mock the select chain for unprocessed events
      const selectResult = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(events),
            })),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectResult as any);

      // Mock the route lookup for routeFinished processing
      const routeSelectChain = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 1, routeConfigPda: "route-pda-1" }]),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(routeSelectChain as any);

      const result = await processor.processUnprocessedEvents();

      expect(result.processed).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("collects errors for failed events", async () => {
      const events = [
        {
          id: 1,
          eventType: "unknownType",
          signature: "sig1",
          eventData: {},
          processed: false,
        },
      ];

      const selectResult = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(events),
            })),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectResult as any);

      // The update after process will be called since unknownType just logs warn
      const result = await processor.processUnprocessedEvents();

      // Unknown event types are just warned, not errored
      expect(result.processed).toBe(1);
    });

    it("returns zero processed when no events", async () => {
      const selectResult = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectResult as any);

      const result = await processor.processUnprocessedEvents();

      expect(result.processed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("processTokenConfigUpdatedEvent", () => {
    it("delegates to tokenConfigsService.update", async () => {
      const event = {
        id: 1,
        eventType: "tokenConfigUpdated",
        eventData: {
          tokenConfig: "config-addr",
          minTransfer: "0e10",
          feeBps: 50,
          feeTreasury: "treasury-addr",
          maxHops: 10,
          flatFeeLamports: "2710",
        },
        processed: false,
      };

      await processor.processTokenConfigUpdatedEvent(event as any);

      expect(mocks.tokenConfigsUpdate).toHaveBeenCalledWith(
        "config-addr",
        expect.objectContaining({
          feeBps: 50,
          maxHops: 10,
          feeTreasury: "treasury-addr",
        })
      );
    });
  });

  describe("getProcessingStats", () => {
    it("returns stats with event counts", async () => {
      // Mock 3 concurrent selects
      const mockSelectAll = {
        from: vi.fn(() => [{ count: 1 }, { count: 2 }, { count: 3 }]),
      };
      const mockSelectProcessed = {
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ count: 1 }, { count: 2 }]),
        })),
      };
      const mockSelectUnprocessed = {
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ count: 3 }]),
        })),
      };
      const mockSelectTypes = {
        from: vi.fn(() => [
          { eventType: "hopCompleted", count: 1 },
          { eventType: "hopCompleted", count: 2 },
          { eventType: "routeCreated", count: 3 },
        ]),
      };

      mockDb.select
        .mockReturnValueOnce(mockSelectAll as any)
        .mockReturnValueOnce(mockSelectProcessed as any)
        .mockReturnValueOnce(mockSelectUnprocessed as any)
        .mockReturnValueOnce(mockSelectTypes as any);

      const stats = await processor.getProcessingStats();

      expect(stats).toHaveProperty("totalEvents");
      expect(stats).toHaveProperty("processedEvents");
      expect(stats).toHaveProperty("unprocessedEvents");
      expect(stats).toHaveProperty("eventsByType");
    });
  });

  describe("reprocessFailedEvents", () => {
    it("reprocesses specific event IDs", async () => {
      const events = [
        {
          id: 5,
          eventType: "routeFinished",
          eventData: { route: "pda", at: "68c33668" },
          routePda: "pda",
          processed: false,
        },
      ];

      const selectResult = {
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(events),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectResult as any);

      // Mock route lookup for routeFinished
      const routeSelectChain = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 1 }]),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(routeSelectChain as any);

      await processor.reprocessFailedEvents([5]);

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("reprocesses all unprocessed events when no IDs provided", async () => {
      const selectResult = {
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectResult as any);

      await processor.reprocessFailedEvents();

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe("processHopCompletedEvent (via processUnprocessedEvents)", () => {
    it("processes hopCompleted: finds route by PDA, updates hop and route", async () => {
      const events = [
        {
          id: 10,
          eventType: "hopCompleted",
          signature: "hop-sig",
          routePda: "route-pda-hop",
          eventData: {
            route: "route-pda-hop",
            hopIndex: 2,
            fromOwner: "from",
            toOwner: "to",
            amount: "1000",
            at: "68c33668",
          },
          processed: false,
        },
      ];

      // 1. Unprocessed events select
      const selectEvents = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(events),
            })),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectEvents as any);

      // 2. Route lookup by PDA (inside tx)
      const routeByPda = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 1, routeConfigPda: "route-pda-hop" }]),
          })),
        })),
      };
      mockDb._tx.select.mockReturnValueOnce(routeByPda);

      // 3. Hop lookup
      const hopSelect = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 5, hopIndex: 2 }]),
          })),
        })),
      };
      mockDb._tx.select.mockReturnValueOnce(hopSelect);

      const result = await processor.processUnprocessedEvents();

      expect(result.processed).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it("handles hopCompleted: route not found by PDA, resolves from chain", async () => {
      const events = [
        {
          id: 11,
          eventType: "hopCompleted",
          signature: "hop-sig-2",
          routePda: "unknown-pda",
          eventData: {
            route: "unknown-pda",
            hopIndex: 0,
            fromOwner: "f",
            toOwner: "t",
            amount: "500",
            at: "68c33668",
          },
          processed: false,
        },
      ];

      const selectEvents = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(events),
            })),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectEvents as any);

      // Route not found by PDA
      const emptyRoute = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      };
      mockDb._tx.select.mockReturnValueOnce(emptyRoute);

      // Resolve from chain succeeds
      mocks.getRouteIdFromPda.mockResolvedValue(42);

      // Route found by routeId
      const routeById = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 7, routeId: 42 }]),
          })),
        })),
      };
      mockDb._tx.select.mockReturnValueOnce(routeById);

      // Hop lookup
      const hopSelect = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 3, hopIndex: 0 }]),
          })),
        })),
      };
      mockDb._tx.select.mockReturnValueOnce(hopSelect);

      const result = await processor.processUnprocessedEvents();

      expect(result.processed).toBe(1);
      expect(mocks.getRouteIdFromPda).toHaveBeenCalled();
    });

    it("handles hopCompleted: route not found at all", async () => {
      const events = [
        {
          id: 12,
          eventType: "hopCompleted",
          signature: "hop-sig-3",
          routePda: "missing-pda",
          eventData: {
            route: "missing-pda",
            hopIndex: 0,
            fromOwner: "f",
            toOwner: "t",
            amount: "100",
            at: "68c33668",
          },
          processed: false,
        },
      ];

      const selectEvents = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(events),
            })),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectEvents as any);

      // Not found by PDA
      mockDb._tx.select.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      // Chain resolution fails
      mocks.getRouteIdFromPda.mockRejectedValue(new Error("not found"));

      const result = await processor.processUnprocessedEvents();

      // Event still processed (just logs warn)
      expect(result.processed).toBe(1);
    });

    it("handles hopCompleted: hop not found for route", async () => {
      const events = [
        {
          id: 13,
          eventType: "hopCompleted",
          signature: "hop-sig-4",
          routePda: "pda-no-hop",
          eventData: {
            route: "pda-no-hop",
            hopIndex: 99,
            fromOwner: "f",
            toOwner: "t",
            amount: "100",
            at: "68c33668",
          },
          processed: false,
        },
      ];

      const selectEvents = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(events),
            })),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectEvents as any);

      // Route found
      mockDb._tx.select.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 1 }]),
          })),
        })),
      });

      // Hop not found
      mockDb._tx.select.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const result = await processor.processUnprocessedEvents();

      expect(result.processed).toBe(1);
    });
  });

  describe("processRouteCreatedEvent (via processUnprocessedEvents)", () => {
    it("processes routeCreated: finds route by routeId + creator", async () => {
      const events = [
        {
          id: 20,
          eventType: "routeCreated",
          signature: "create-sig",
          routePda: null,
          eventData: {
            route: "new-route-pda",
            creator: "creator-addr",
            mint: "mint-addr",
            hops: 3,
          },
          processed: false,
        },
      ];

      const selectEvents = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(events),
            })),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectEvents as any);

      // getRouteIdFromPda succeeds
      mocks.getRouteIdFromPda.mockResolvedValue(10);

      // Route found by routeId + creator
      const routeSelect = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 3, routeId: 10, creator: "creator-addr" }]),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(routeSelect as any);

      const result = await processor.processUnprocessedEvents();

      expect(result.processed).toBe(1);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("processes routeCreated: falls back to tx hash matching", async () => {
      const events = [
        {
          id: 21,
          eventType: "routeCreated",
          signature: "create-sig-2",
          routePda: null,
          eventData: {
            route: "pda-2",
            creator: "creator2",
            mint: "m",
            hops: 1,
          },
          processed: false,
        },
      ];

      const selectEvents = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(events),
            })),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectEvents as any);

      // getRouteIdFromPda fails
      mocks.getRouteIdFromPda.mockRejectedValue(new Error("fail"));

      // Fallback: tx hash match succeeds
      const txHashMatch = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 5 }]),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(txHashMatch as any);

      const result = await processor.processUnprocessedEvents();

      expect(result.processed).toBe(1);
    });

    it("processes routeCreated: no matching route found", async () => {
      const events = [
        {
          id: 22,
          eventType: "routeCreated",
          signature: "create-sig-3",
          routePda: null,
          eventData: {
            route: "pda-3",
            creator: "unknown-creator",
            mint: "m",
            hops: 1,
          },
          processed: false,
        },
      ];

      const selectEvents = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(events),
            })),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectEvents as any);

      mocks.getRouteIdFromPda.mockResolvedValue(null);

      // No route found by tx hash either
      const noMatch = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(noMatch as any);

      const result = await processor.processUnprocessedEvents();

      expect(result.processed).toBe(1);
    });
  });

  describe("processRouteFinishedEvent (via processUnprocessedEvents)", () => {
    it("handles route not found", async () => {
      const events = [
        {
          id: 30,
          eventType: "routeFinished",
          signature: "fin-sig",
          routePda: null,
          eventData: { route: "missing-pda", at: "68c33668" },
          processed: false,
        },
      ];

      const selectEvents = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(events),
            })),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectEvents as any);

      // Route not found
      const noRoute = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(noRoute as any);

      const result = await processor.processUnprocessedEvents();

      expect(result.processed).toBe(1);
    });
  });

  describe("processTokenConfigCreatedEvent (via processUnprocessedEvents)", () => {
    it("creates token config via service", async () => {
      const events = [
        {
          id: 40,
          eventType: "tokenConfigCreated",
          signature: "tc-sig",
          routePda: null,
          eventData: {
            tokenConfig: "tc-addr",
            creator: "creator-addr",
            tokenMint: "mint",
            minTransfer: "03e8",
            feeBps: 100,
            feeTreasury: "treasury",
            maxHops: 5,
            flatFeeLamports: "0",
          },
          processed: false,
        },
      ];

      const selectEvents = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(events),
            })),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectEvents as any);

      const result = await processor.processUnprocessedEvents();

      expect(result.processed).toBe(1);
      expect(mocks.tokenConfigsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenConfigAddress: "tc-addr",
          creator: "creator-addr",
          feeBps: 100,
          maxHops: 5,
        })
      );
    });
  });

  describe("processUnprocessedEvents - error collection", () => {
    it("collects error when event processing throws", async () => {
      const events = [
        {
          id: 50,
          eventType: "hopCompleted",
          signature: "err-sig",
          routePda: "err-pda",
          eventData: {
            route: "err-pda",
            hopIndex: 0,
            fromOwner: "f",
            toOwner: "t",
            amount: "1",
            at: "bad-hex",
          },
          processed: false,
        },
      ];

      const selectEvents = {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(events),
            })),
          })),
        })),
      };
      mockDb.select.mockReturnValueOnce(selectEvents as any);

      // Transaction throws
      mockDb.transaction.mockRejectedValueOnce(new Error("tx error"));

      const result = await processor.processUnprocessedEvents();

      expect(result.processed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].eventId).toBe(50);
    });
  });

  describe("convertHexTimestampToDate / convertHexToNumber (via event processing)", () => {
    it("correctly converts hex timestamp in tokenConfigUpdated", async () => {
      const event = {
        id: 60,
        eventType: "tokenConfigUpdated",
        eventData: {
          tokenConfig: "addr",
          minTransfer: "03e8", // 1000 in hex
          feeBps: 50,
          feeTreasury: "treas",
          maxHops: 3,
          flatFeeLamports: "2710", // 10000 in hex
        },
        processed: false,
      };

      await processor.processTokenConfigUpdatedEvent(event as any);

      expect(mocks.tokenConfigsUpdate).toHaveBeenCalledWith(
        "addr",
        expect.objectContaining({
          minTransferAmount: 0x03e8, // 1000
          flatFeeLamports: 0x2710, // 10000
        })
      );
    });
  });
});
