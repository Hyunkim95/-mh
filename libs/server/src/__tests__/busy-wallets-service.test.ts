import { describe, it, expect, vi, beforeEach } from "vitest";
import { BusyWalletsService } from "../busy-wallets/services/busy-wallets.service";

describe("BusyWalletsService", () => {
  let service: BusyWalletsService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    };
    service = new BusyWalletsService(mockDb);
    vi.clearAllMocks();
  });

  describe("getRandomWallets", () => {
    it("should return requested number of wallets", async () => {
      const wallets = [
        { id: 1, address: "addr1", isActive: true },
        { id: 2, address: "addr2", isActive: true },
        { id: 3, address: "addr3", isActive: true },
      ];
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(wallets),
            }),
          }),
        }),
      });

      const result = await service.getRandomWallets(2);
      expect(result).toHaveLength(2);
    });

    it("should deduplicate by address", async () => {
      const wallets = [
        { id: 1, address: "addr1", isActive: true },
        { id: 2, address: "addr1", isActive: true }, // duplicate
        { id: 3, address: "addr2", isActive: true },
      ];
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(wallets),
            }),
          }),
        }),
      });

      const result = await service.getRandomWallets(3);
      // After dedup, only 2 unique addresses remain
      expect(result).toHaveLength(2);
      const addresses = result.map((w: any) => w.address);
      expect(new Set(addresses).size).toBe(addresses.length);
    });

    it("should return fewer wallets if not enough available", async () => {
      const wallets = [{ id: 1, address: "addr1", isActive: true }];
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(wallets),
            }),
          }),
        }),
      });

      const result = await service.getRandomWallets(5);
      expect(result).toHaveLength(1);
    });
  });

  describe("markWalletsUsed", () => {
    it("should update lastUsedAt for each wallet", async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      });

      await service.markWalletsUsed([1, 2, 3]);
      expect(mockDb.update).toHaveBeenCalledTimes(3);
    });

    it("should do nothing when given empty array", async () => {
      await service.markWalletsUsed([]);
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe("getByAddress", () => {
    it("should return wallet when found", async () => {
      const wallet = { id: 1, address: "addr1" };
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([wallet]),
          }),
        }),
      });

      const result = await service.getByAddress("addr1");
      expect(result).toEqual(wallet);
    });

    it("should return null when not found", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await service.getByAddress("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("create", () => {
    it("should insert and return the wallet", async () => {
      const wallet = { id: 1, address: "addr1", isActive: true };
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([wallet]),
        }),
      });

      const result = await service.create({ address: "addr1" } as any);
      expect(result).toEqual(wallet);
    });
  });

  describe("bulkCreate", () => {
    it("should insert multiple wallets", async () => {
      const wallets = [
        { id: 1, address: "addr1" },
        { id: 2, address: "addr2" },
      ];
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(wallets),
        }),
      });

      const result = await service.bulkCreate([
        { address: "addr1" },
        { address: "addr2" },
      ] as any[]);
      expect(result).toEqual(wallets);
    });

    it("should return empty array for empty input", async () => {
      const result = await service.bulkCreate([]);
      expect(result).toEqual([]);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe("getActiveCount", () => {
    it("should return the count of active wallets", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }, { count: 2 }, { count: 3 }]),
        }),
      });

      const result = await service.getActiveCount();
      expect(result).toBe(3);
    });

    it("should return 0 when no active wallets", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await service.getActiveCount();
      expect(result).toBe(0);
    });
  });
});
