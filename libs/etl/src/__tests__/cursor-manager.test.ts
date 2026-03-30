import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatabaseCursorManager } from "../cursors/database-cursor-manager";

// Build a mock drizzle db that supports chained query methods
function createMockDb() {
  const chainable = () => {
    const chain: any = {
      _result: [] as any[],
      _rowCount: 0,
      select: vi.fn(() => chain),
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn(() => chain._result),
      set: vi.fn(() => chain),
      values: vi.fn(() => chain),
      then: undefined as any, // make it thenable
    };
    // Make the chain itself act as a promise for update/delete/insert
    chain.then = (resolve: any) => resolve({ rowCount: chain._rowCount });
    return chain;
  };

  const selectChain = chainable();
  const updateChain = chainable();
  const deleteChain = chainable();
  const insertChain = chainable();

  const db = {
    select: vi.fn(() => selectChain),
    update: vi.fn(() => updateChain),
    delete: vi.fn(() => deleteChain),
    insert: vi.fn(() => insertChain),
    _selectChain: selectChain,
    _updateChain: updateChain,
    _deleteChain: deleteChain,
    _insertChain: insertChain,
  };

  return db;
}

describe("DatabaseCursorManager", () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let manager: DatabaseCursorManager;

  beforeEach(() => {
    mockDb = createMockDb();
    manager = new DatabaseCursorManager(mockDb as any);
  });

  describe("getCursor", () => {
    it("returns null when no cursor found", async () => {
      mockDb._selectChain._result = [];
      const result = await manager.getCursor("test-job");
      expect(result).toBeNull();
    });

    it("returns cursor data when found", async () => {
      const lastProcessed = new Date();
      mockDb._selectChain._result = [
        {
          cursorValue: "cursor-123",
          metadata: { batch: 5 },
          lastProcessedAt: lastProcessed,
        },
      ];

      const result = await manager.getCursor("test-job");
      expect(result).toEqual({
        value: "cursor-123",
        metadata: { batch: 5 },
        lastProcessedAt: lastProcessed,
      });
    });

    it("wraps errors with descriptive message", async () => {
      mockDb._selectChain.limit = vi.fn(() => {
        throw new Error("db error");
      });

      await expect(manager.getCursor("test-job")).rejects.toThrow(
        "Failed to get cursor for job test-job"
      );
    });
  });

  describe("updateCursor", () => {
    it("calls update on the database", async () => {
      mockDb._updateChain._rowCount = 1;
      await manager.updateCursor("test-job", "new-cursor", { batch: 1 });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("inserts new cursor when update affects 0 rows", async () => {
      mockDb._updateChain._rowCount = 0;
      await manager.updateCursor("test-job", "new-cursor");
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("wraps errors with descriptive message", async () => {
      mockDb.update = vi.fn(() => {
        throw new Error("db error");
      });

      await expect(
        manager.updateCursor("test-job", "val")
      ).rejects.toThrow("Failed to update cursor for job test-job");
    });
  });

  describe("deleteCursor", () => {
    it("calls delete on the database", async () => {
      await manager.deleteCursor("test-job");
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("wraps errors with descriptive message", async () => {
      mockDb.delete = vi.fn(() => {
        throw new Error("db error");
      });

      await expect(manager.deleteCursor("test-job")).rejects.toThrow(
        "Failed to delete cursor for job test-job"
      );
    });
  });

  describe("listCursors", () => {
    it("returns all cursors", async () => {
      const cursors = [
        { id: 1, jobName: "job-a", cursorValue: "a" },
        { id: 2, jobName: "job-b", cursorValue: "b" },
      ];

      // For listCursors, select().from() is awaited directly
      const selectChain = {
        from: vi.fn(() => Promise.resolve(cursors)),
      };
      mockDb.select = vi.fn(() => selectChain as any);

      const result = await manager.listCursors();
      expect(result).toEqual(cursors);
    });

    it("wraps errors with descriptive message", async () => {
      mockDb.select = vi.fn(() => {
        throw new Error("db error");
      });

      await expect(manager.listCursors()).rejects.toThrow(
        "Failed to list cursors"
      );
    });
  });

  describe("getCursorAge", () => {
    it("returns null when cursor does not exist", async () => {
      mockDb._selectChain._result = [];
      const age = await manager.getCursorAge("test-job");
      expect(age).toBeNull();
    });

    it("returns age in milliseconds", async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      mockDb._selectChain._result = [
        {
          cursorValue: "v",
          metadata: {},
          lastProcessedAt: fiveMinutesAgo,
        },
      ];

      const age = await manager.getCursorAge("test-job");
      expect(age).toBeGreaterThanOrEqual(5 * 60 * 1000 - 100);
      expect(age).toBeLessThan(5 * 60 * 1000 + 1000);
    });
  });

  describe("cleanupOldCursors", () => {
    it("calls delete and returns row count", async () => {
      mockDb._deleteChain._rowCount = 3;
      const count = await manager.cleanupOldCursors(24 * 60 * 60 * 1000);
      expect(count).toBe(3);
    });

    it("wraps errors with descriptive message", async () => {
      mockDb.delete = vi.fn(() => {
        throw new Error("db error");
      });

      await expect(
        manager.cleanupOldCursors(1000)
      ).rejects.toThrow("Failed to cleanup old cursors");
    });
  });
});
