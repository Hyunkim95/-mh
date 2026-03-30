import { describe, it, expect, vi } from "vitest";

vi.mock("@solana/web3.js", () => ({
  PublicKey: class MockPublicKey {
    constructor(key: string) {
      // Mimic real PublicKey: throw on invalid base58
      if (!key || key.length < 32) throw new Error("Invalid public key input");
    }
  },
}));

import {
  formatDuration,
  parseNumber,
  formatTokenAmount,
  isValidSolanaAddress,
  maskAddress,
  getRowBaseTime,
  calculateTotalMinutes,
  getLastHopWallet,
  hasBlockingWalletErrors,
} from "../pages/configureHops/utils";

describe("configureHops/utils", () => {
  describe("formatDuration", () => {
    it("formats hours and minutes", () => {
      expect(formatDuration(90)).toBe("1h 30m");
    });

    it("formats hours only", () => {
      expect(formatDuration(120)).toBe("2h");
    });

    it("formats minutes only", () => {
      expect(formatDuration(45)).toBe("45m");
    });

    it("returns 0m for zero", () => {
      expect(formatDuration(0)).toBe("0m");
    });
  });

  describe("parseNumber", () => {
    it("returns 0 for undefined", () => {
      expect(parseNumber(undefined)).toBe(0);
    });

    it("returns number as-is", () => {
      expect(parseNumber(42)).toBe(42);
    });

    it("parses numeric string", () => {
      expect(parseNumber("123.45")).toBe(123.45);
    });

    it("strips dollar signs and commas", () => {
      expect(parseNumber("$1,234.56")).toBe(1234.56);
    });

    it("returns 0 for non-numeric string", () => {
      expect(parseNumber("abc")).toBe(0);
    });

    it("trims whitespace", () => {
      expect(parseNumber("  50  ")).toBe(50);
    });
  });

  describe("formatTokenAmount", () => {
    it("formats whole numbers", () => {
      expect(formatTokenAmount(1000)).toBe("1,000");
    });

    it("formats decimals up to 6 places", () => {
      expect(formatTokenAmount(1.123456)).toBe("1.123456");
    });

    it("returns 0 for Infinity", () => {
      expect(formatTokenAmount(Infinity)).toBe("0");
    });

    it("returns 0 for NaN", () => {
      expect(formatTokenAmount(NaN)).toBe("0");
    });

    it("removes trailing zeros", () => {
      expect(formatTokenAmount(1.1)).toBe("1.1");
    });
  });

  describe("isValidSolanaAddress", () => {
    it("returns true for valid-length base58 string", () => {
      // 44-char base58 string (like a real Solana address)
      expect(isValidSolanaAddress("11111111111111111111111111111111")).toBe(true);
    });

    it("returns false for empty string", () => {
      expect(isValidSolanaAddress("")).toBe(false);
    });

    it("returns false for short string", () => {
      expect(isValidSolanaAddress("abc")).toBe(false);
    });

    it("trims whitespace", () => {
      expect(isValidSolanaAddress("  11111111111111111111111111111111  ")).toBe(true);
    });
  });

  describe("maskAddress", () => {
    it("masks long addresses", () => {
      expect(maskAddress("11111111111111111111111111111111")).toBe("1111…111");
    });

    it("returns short address as-is", () => {
      expect(maskAddress("short")).toBe("short");
    });

    it("returns exactly 10-char address as-is", () => {
      expect(maskAddress("1234567890")).toBe("1234567890");
    });
  });

  describe("getRowBaseTime", () => {
    it("returns now for index 0", () => {
      const before = Date.now();
      const result = getRowBaseTime([{ wallet: "A", delayMinutes: 5 }], 0);
      const after = Date.now();
      expect(result.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.getTime()).toBeLessThanOrEqual(after);
    });

    it("returns now for empty hops before index", () => {
      const result = getRowBaseTime([], 1);
      expect(result).toBeInstanceOf(Date);
    });

    it("accumulates delay from previous rows", () => {
      const hops = [
        { wallet: "A", delayMinutes: 10 },
        { wallet: "B", delayMinutes: 20 },
        { wallet: "C", delayMinutes: 30 },
      ];
      const before = Date.now();
      const result = getRowBaseTime(hops, 2);
      // Should add 10 + 20 = 30 minutes to now
      const expectedMin = before + 30 * 60 * 1000;
      expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin - 100);
    });

    it("uses scheduledAtUtc when present", () => {
      const hops = [
        { wallet: "A", delayMinutes: null, scheduledAtUtc: "2024-06-15T12:00:00Z" },
        { wallet: "B", delayMinutes: 30 },
      ];
      const result = getRowBaseTime(hops, 1);
      expect(result.getTime()).toBe(new Date("2024-06-15T12:00:00Z").getTime());
    });
  });

  describe("calculateTotalMinutes", () => {
    it("returns 0 for empty hops", () => {
      expect(calculateTotalMinutes([])).toBe(0);
    });

    it("returns 0 when all wallets are empty", () => {
      expect(calculateTotalMinutes([{ wallet: "", delayMinutes: 10 }])).toBe(0);
    });

    it("calculates cumulative delay", () => {
      const hops = [
        { wallet: "A", delayMinutes: 0 },
        { wallet: "B", delayMinutes: 10 },
        { wallet: "C", delayMinutes: 20 },
      ];
      const result = calculateTotalMinutes(hops);
      // Total: 0 + 10 + 20 = 30 minutes from now
      expect(result).toBe(30);
    });
  });

  describe("getLastHopWallet", () => {
    it("returns last non-empty wallet", () => {
      const hops = [
        { wallet: "A", delayMinutes: 0 },
        { wallet: "B", delayMinutes: 10 },
        { wallet: "", delayMinutes: 5 },
      ];
      expect(getLastHopWallet(hops)).toBe("B");
    });

    it("returns empty string when no wallets", () => {
      expect(getLastHopWallet([])).toBe("");
    });

    it("trims wallet strings", () => {
      const hops = [{ wallet: "  X  ", delayMinutes: 0 }];
      expect(getLastHopWallet(hops)).toBe("X");
    });
  });

  describe("hasBlockingWalletErrors", () => {
    it("returns false for no errors", () => {
      expect(hasBlockingWalletErrors({})).toBe(false);
    });

    it("returns false for null entries", () => {
      expect(hasBlockingWalletErrors({ 0: null, 1: null })).toBe(false);
    });

    it("returns true for invalid solana address error", () => {
      expect(hasBlockingWalletErrors({ 0: "Invalid solana address" })).toBe(true);
    });

    it("returns true for checking error", () => {
      expect(hasBlockingWalletErrors({ 0: "Checking..." })).toBe(true);
    });

    it("returns false for non-blocking errors", () => {
      expect(hasBlockingWalletErrors({ 0: "Some other warning" })).toBe(false);
    });
  });
});
