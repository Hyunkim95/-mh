import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findProgramAddressSync: vi.fn().mockReturnValue([{ equals: vi.fn(), toBuffer: vi.fn() }]),
  fetchRouteConfig: vi.fn(),
  fetchRouteState: vi.fn(),
}));

vi.mock("@solana/web3.js", () => ({
  PublicKey: class MockPublicKey {
    _key: string;
    constructor(key: string) {
      this._key = key;
    }
    toString() { return this._key; }
    toBase58() { return this._key; }
    toBuffer() { return Buffer.from(this._key); }
    equals(other: any) { return this._key === other._key; }
    static findProgramAddressSync(seeds: any[], programId: any) {
      return mocks.findProgramAddressSync(seeds, programId);
    }
  },
  Connection: class MockConnection {},
  clusterApiUrl: vi.fn().mockReturnValue("https://api.devnet.solana.com"),
}));

vi.mock("@coral-xyz/anchor", () => ({
  Program: class MockProgram {
    account = {
      routeConfig: { fetch: mocks.fetchRouteConfig },
      routeState: { fetch: mocks.fetchRouteState },
    };
  },
  AnchorProvider: class MockAnchorProvider {
    constructor() {}
  },
  BN: class MockBN {
    _val: number;
    constructor(val: any) { this._val = Number(val); }
    toNumber() { return this._val; }
    toArrayLike(_type: any, _endian: string, _len: number) {
      const buf = Buffer.alloc(_len);
      buf.writeUInt32LE(this._val, 0);
      return buf;
    }
  },
  EventParser: class MockEventParser {},
}));

vi.mock("../idl/multi_hopper_project.json", () => ({
  default: { address: "11111111111111111111111111111111" },
  address: "11111111111111111111111111111111",
}));

vi.mock("@libs/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  parseRouteId,
  getTokenConfigPda,
  getRouteConfigPda,
  getRouteStatePda,
  verifyRoutePda,
  getRouteConfigPdas,
  getRouteIdFromPda,
  getRouteConfiguration,
  getRouteStateAccount,
  isValidRouteConfigPda,
  buildEventParser,
  MULTI_HOPPER_PROGRAM_ID,
} from "../solana/services/contract-utils";

import { BN } from "@coral-xyz/anchor";

describe("contract-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockPda = {
      _key: "derived-pda",
      toString: () => "derived-pda",
      toBase58: () => "derived-pda",
      toBuffer: () => Buffer.from("derived-pda"),
      equals: (other: any) => other._key === "derived-pda",
    };
    mocks.findProgramAddressSync.mockReturnValue([mockPda]);
  });

  describe("parseRouteId", () => {
    it("returns number as-is", () => {
      expect(parseRouteId(42)).toBe(42);
    });

    it("parses string to number", () => {
      expect(parseRouteId("123")).toBe(123);
    });

    it("converts BN to number", () => {
      expect(parseRouteId(new BN(99))).toBe(99);
    });

    it("throws on invalid format", () => {
      expect(() => parseRouteId({} as any)).toThrow("Invalid route ID format");
    });
  });

  describe("getTokenConfigPda", () => {
    it("derives PDA with default program ID", async () => {
      const result = await getTokenConfigPda({ toBuffer: () => Buffer.from("mint") } as any);

      expect(mocks.findProgramAddressSync).toHaveBeenCalledWith(
        [Buffer.from("token_config_v1"), Buffer.from("mint")],
        expect.anything()
      );
      expect(result).toBeDefined();
    });

    it("accepts custom program ID", async () => {
      const customProgram = { _key: "custom-prog" } as any;
      await getTokenConfigPda({ toBuffer: () => Buffer.from("m") } as any, customProgram);

      expect(mocks.findProgramAddressSync).toHaveBeenCalledWith(
        expect.anything(),
        customProgram
      );
    });
  });

  describe("getRouteConfigPda", () => {
    it("derives route config PDA", async () => {
      const result = await getRouteConfigPda(new BN(1));

      expect(mocks.findProgramAddressSync).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("getRouteStatePda", () => {
    it("derives route state PDA", async () => {
      const result = await getRouteStatePda(new BN(1));

      expect(mocks.findProgramAddressSync).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("verifyRoutePda", () => {
    it("returns true when PDAs match", async () => {
      const routePda = {
        _key: "derived-pda",
        toString: () => "derived-pda",
        toBase58: () => "derived-pda",
        equals: (other: any) => other._key === "derived-pda",
      } as any;

      const result = await verifyRoutePda(routePda, 1);
      expect(result).toBe(true);
    });

    it("returns false when PDAs don't match", async () => {
      const routePda = {
        _key: "different-pda",
        toString: () => "different-pda",
        equals: () => false,
      } as any;

      const result = await verifyRoutePda(routePda, 1);
      expect(result).toBe(false);
    });

    it("returns false on error", async () => {
      mocks.findProgramAddressSync.mockImplementation(() => {
        throw new Error("PDA error");
      });

      const result = await verifyRoutePda({} as any, 1);
      expect(result).toBe(false);
    });
  });

  describe("getRouteConfigPdas", () => {
    it("derives PDAs for multiple route IDs", async () => {
      const results = await getRouteConfigPdas([1, 2, 3]);

      expect(results).toHaveLength(3);
      expect(results[0].routeId).toBe(1);
      expect(results[1].routeId).toBe(2);
    });

    it("skips failed PDA derivations", async () => {
      let callCount = 0;
      mocks.findProgramAddressSync.mockImplementation(() => {
        callCount++;
        if (callCount === 2) throw new Error("fail");
        return [{ _key: "pda" }];
      });

      const results = await getRouteConfigPdas([1, 2, 3]);
      expect(results).toHaveLength(2);
    });
  });

  describe("getRouteIdFromPda", () => {
    it("returns route ID from on-chain account", async () => {
      mocks.fetchRouteConfig.mockResolvedValue({
        routeId: { toNumber: () => 42 },
      });

      const result = await getRouteIdFromPda({ _key: "pda" } as any);
      expect(result).toBe(42);
    });

    it("returns null on fetch error", async () => {
      mocks.fetchRouteConfig.mockRejectedValue(new Error("not found"));

      const result = await getRouteIdFromPda({ toString: () => "bad" } as any);
      expect(result).toBeNull();
    });
  });

  describe("getRouteConfiguration", () => {
    it("returns route config from on-chain", async () => {
      mocks.fetchRouteConfig.mockResolvedValue({
        creator: { toBase58: () => "creator1" },
        routeId: { toString: () => "1" },
        sourceOwner: { toBase58: () => "source1" },
        executor: { toBase58: () => "exec1" },
        hops: [],
        hopAmount: { toString: () => "1000" },
        isFinalized: true,
        createdAt: { toString: () => "12345" },
      });

      const result = await getRouteConfiguration(1);

      expect(result).toBeDefined();
      expect(result!.creator).toBe("creator1");
      expect(result!.isFinalized).toBe(true);
    });

    it("returns null on error", async () => {
      mocks.fetchRouteConfig.mockRejectedValue(new Error("fail"));

      const result = await getRouteConfiguration(999);
      expect(result).toBeNull();
    });
  });

  describe("getRouteStateAccount", () => {
    it("returns route state from on-chain", async () => {
      mocks.fetchRouteState.mockResolvedValue({
        currentHopIndex: 2,
        startedAt: { toString: () => "1000" },
        lastHopAt: [{ toString: () => "2000" }],
        hopsCount: 5,
      });

      const result = await getRouteStateAccount(1);

      expect(result).toBeDefined();
      expect(result!.currentHopIndex).toBe(2);
      expect(result!.hopsCount).toBe(5);
    });

    it("returns null on error", async () => {
      mocks.fetchRouteState.mockRejectedValue(new Error("fail"));

      const result = await getRouteStateAccount(999);
      expect(result).toBeNull();
    });
  });

  describe("isValidRouteConfigPda", () => {
    it("returns true when account exists", async () => {
      mocks.fetchRouteConfig.mockResolvedValue({});

      const result = await isValidRouteConfigPda({ _key: "valid" } as any);
      expect(result).toBe(true);
    });

    it("returns false when fetch fails", async () => {
      mocks.fetchRouteConfig.mockRejectedValue(new Error("not found"));

      const result = await isValidRouteConfigPda({ _key: "invalid" } as any);
      expect(result).toBe(false);
    });
  });

  describe("buildEventParser", () => {
    it("returns an EventParser instance", () => {
      const parser = buildEventParser({ _key: "prog" } as any, {} as any);
      expect(parser).toBeDefined();
    });
  });

  describe("MULTI_HOPPER_PROGRAM_ID", () => {
    it("is exported", () => {
      expect(MULTI_HOPPER_PROGRAM_ID).toBeDefined();
    });
  });
});
