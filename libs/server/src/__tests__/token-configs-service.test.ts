import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const { mockSelect, mockInsert, mockUpdate } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
}));

// Mock the database
vi.mock("../db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
  tokenConfigsSchema: {
    id: "id",
    tokenConfigAddress: "tokenConfigAddress",
    pairAddress: "pairAddress",
    creator: "creator",
    tokenMint: "tokenMint",
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  ilike: vi.fn((col, val) => ({ type: "ilike", col, val })),
  inArray: vi.fn((col, val) => ({ type: "inArray", col, val })),
  and: vi.fn((...args: any[]) => ({ type: "and", args })),
}));

import { tokenConfigsService } from "../token-configs/services/token-configs.service";

describe("tokenConfigsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("should insert a token config with upsert", async () => {
      const tokenConfig = {
        tokenConfigAddress: "addr1",
        pairAddress: "pair1",
        tokenMint: "mint1",
        creator: "creator1",
      };
      const mockReturning = vi.fn().mockResolvedValue([tokenConfig]);
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: mockReturning,
          }),
        }),
      });

      const result = await tokenConfigsService.create(tokenConfig as any);
      expect(result).toEqual([tokenConfig]);
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe("findById", () => {
    it("should return the config when found", async () => {
      const config = { id: 1, tokenConfigAddress: "addr1" };
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([config]),
        }),
      });

      const result = await tokenConfigsService.findById(1);
      expect(result).toEqual(config);
    });

    it("should return null when not found", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await tokenConfigsService.findById(999);
      expect(result).toBeNull();
    });
  });

  describe("hasPair", () => {
    it("should return true when pair exists", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 1 }]),
          }),
        }),
      });

      const result = await tokenConfigsService.hasPair({
        pairAddress: "pair1",
      } as any);
      expect(result).toBe(true);
    });

    it("should return false when pair does not exist", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await tokenConfigsService.hasPair({
        pairAddress: "nonexistent",
      } as any);
      expect(result).toBe(false);
    });
  });

  describe("findByCreator", () => {
    it("should return configs matching creator", async () => {
      const configs = [
        { id: 1, creator: "creator1" },
        { id: 2, creator: "creator1" },
      ];
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(configs),
        }),
      });

      const result = await tokenConfigsService.findByCreator("creator1");
      expect(result).toEqual(configs);
    });
  });

  describe("findIn", () => {
    it("should return configs matching mints", async () => {
      const configs = [{ id: 1, tokenMint: "mint1" }];
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(configs),
        }),
      });

      const result = await tokenConfigsService.findIn(["mint1", "mint2"]);
      expect(result).toEqual(configs);
    });

    it("should return empty array when no matches", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await tokenConfigsService.findIn(["nonexistent"]);
      expect(result).toEqual([]);
    });
  });

  describe("update", () => {
    it("should update the token config by address", async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      });

      await tokenConfigsService.update("addr1", { creator: "newCreator" } as any);
      expect(mockUpdate).toHaveBeenCalled();
    });
  });
});
