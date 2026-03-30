import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const { mockSelect, mockInsert, mockVerifySignature } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockVerifySignature: vi.fn(),
}));

// Mock the database
vi.mock("../db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

// Mock auth service
vi.mock("../auth/services/auth.service", () => ({
  verifySignature: mockVerifySignature,
}));

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

// Mock user schema
vi.mock("../auth/schema/user.entities", () => ({
  userSchema: {
    publicKey: "publicKey",
  },
}));

import {
  findUserByPublicKey,
  createUser,
  verifyUserWithSignature,
} from "../auth/services/users.service";

describe("users.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findUserByPublicKey", () => {
    it("should return the user when found", async () => {
      const mockUser = { id: 1, publicKey: "abc123", role: "user" };
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockUser]),
        }),
      });

      const result = await findUserByPublicKey("abc123");
      expect(result).toEqual(mockUser);
    });

    it("should return null when no user found", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await findUserByPublicKey("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("createUser", () => {
    it("should insert and return the new user", async () => {
      const mockUser = { id: 1, publicKey: "abc123", role: "user" };
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      });

      const result = await createUser("abc123");
      expect(result).toEqual(mockUser);
    });
  });

  describe("verifyUserWithSignature", () => {
    it("should throw if signature is invalid", async () => {
      mockVerifySignature.mockResolvedValue(false);

      await expect(
        verifyUserWithSignature("nonce", "addr", "sig", false)
      ).rejects.toThrow("Invalid signature");
    });

    it("should return existing user if found", async () => {
      const mockUser = { id: 1, publicKey: "addr", role: "user" };
      mockVerifySignature.mockResolvedValue(true);
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockUser]),
        }),
      });

      const result = await verifyUserWithSignature("nonce", "addr", "sig");
      expect(result).toEqual(mockUser);
    });

    it("should create a new user when not found", async () => {
      const newUser = { id: 2, publicKey: "addr", role: "user" };
      mockVerifySignature.mockResolvedValue(true);
      // findUserByPublicKey returns null
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
      // createUser returns new user
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newUser]),
          }),
        }),
      });

      const result = await verifyUserWithSignature("nonce", "addr", "sig");
      expect(result).toEqual(newUser);
    });

    it("should pass isHardwareWallet flag through to verifySignature", async () => {
      mockVerifySignature.mockResolvedValue(true);
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 1, publicKey: "addr" }]),
        }),
      });

      await verifyUserWithSignature("nonce", "addr", "sig", true);
      expect(mockVerifySignature).toHaveBeenCalledWith("addr", "nonce", "sig", true);
    });
  });
});
