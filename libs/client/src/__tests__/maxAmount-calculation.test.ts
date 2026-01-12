import { describe, it, expect } from "vitest";

/**
 * Tests for maxAmount calculation that accounts for fees.
 *
 * The formula: maxAmount = balance / (1 + feePercentage)
 * This ensures: maxAmount + (maxAmount * feePercentage) = balance
 *
 * Example with 1% fee and 100 token balance:
 *   maxAmount = 100 / 1.01 = 99.0099...
 *   fee = 99.0099 * 0.01 = 0.990099
 *   total = 99.0099 + 0.990099 = 100.00 (user's full balance)
 */

// Extract the calculation logic from AmountSelector/EasyRouteForm
function calculateMaxAmount(balance: number, feePercentage: number): number {
  if (balance <= 0 || feePercentage <= 0) return balance;
  const maxRoutable = balance / (1 + feePercentage);
  // Round down to avoid precision issues that could cause insufficient funds
  return Math.floor(maxRoutable * 1e6) / 1e6;
}

// Calculate the fee for a given amount
function calculateFee(amount: number, feePercentage: number): number {
  return amount * feePercentage;
}

describe("maxAmount calculation", () => {
  describe("Basic fee calculation", () => {
    it("should calculate maxAmount correctly with 1% fee", () => {
      const balance = 1000;
      const feePercentage = 0.01; // 1%

      const maxAmount = calculateMaxAmount(balance, feePercentage);
      const fee = calculateFee(maxAmount, feePercentage);
      const total = maxAmount + fee;

      // Max amount should be less than balance
      expect(maxAmount).toBeLessThan(balance);
      // Max amount + fee should not exceed balance
      expect(total).toBeLessThanOrEqual(balance);
      // Should be approximately 990.099 (1000 / 1.01)
      expect(maxAmount).toBeCloseTo(990.099, 2);
    });

    it("should calculate maxAmount correctly with 0.5% fee", () => {
      const balance = 1000;
      const feePercentage = 0.005; // 0.5%

      const maxAmount = calculateMaxAmount(balance, feePercentage);
      const fee = calculateFee(maxAmount, feePercentage);
      const total = maxAmount + fee;

      expect(total).toBeLessThanOrEqual(balance);
      // Should be approximately 995.024 (1000 / 1.005)
      expect(maxAmount).toBeCloseTo(995.024, 2);
    });

    it("should calculate maxAmount correctly with 5% fee", () => {
      const balance = 1000;
      const feePercentage = 0.05; // 5%

      const maxAmount = calculateMaxAmount(balance, feePercentage);
      const fee = calculateFee(maxAmount, feePercentage);
      const total = maxAmount + fee;

      expect(total).toBeLessThanOrEqual(balance);
      // Should be approximately 952.38 (1000 / 1.05)
      expect(maxAmount).toBeCloseTo(952.38, 2);
    });

    it("should return full balance when feePercentage is 0", () => {
      const balance = 1000;
      const feePercentage = 0;

      const maxAmount = calculateMaxAmount(balance, feePercentage);

      expect(maxAmount).toBe(balance);
    });

    it("should return full balance when feePercentage is negative", () => {
      const balance = 1000;
      const feePercentage = -0.01;

      const maxAmount = calculateMaxAmount(balance, feePercentage);

      expect(maxAmount).toBe(balance);
    });
  });

  describe("Edge cases", () => {
    it("should handle very small balances (< 1 token)", () => {
      const balance = 0.5;
      const feePercentage = 0.01;

      const maxAmount = calculateMaxAmount(balance, feePercentage);
      const fee = calculateFee(maxAmount, feePercentage);
      const total = maxAmount + fee;

      expect(maxAmount).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(balance);
    });

    it("should handle very large balances (billions of tokens)", () => {
      const balance = 1_000_000_000_000; // 1 trillion
      const feePercentage = 0.01;

      const maxAmount = calculateMaxAmount(balance, feePercentage);
      const fee = calculateFee(maxAmount, feePercentage);
      const total = maxAmount + fee;

      expect(maxAmount).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(balance);
    });

    it("should round down to prevent insufficient funds", () => {
      const balance = 100;
      const feePercentage = 0.01;

      const maxAmount = calculateMaxAmount(balance, feePercentage);
      const fee = calculateFee(maxAmount, feePercentage);
      const total = maxAmount + fee;

      // Total should NEVER exceed balance due to rounding down
      expect(total).toBeLessThanOrEqual(balance);
    });

    it("should handle 6 decimal tokens (USDC-like)", () => {
      const balance = 1849611.54; // Route 997's actual balance
      const feePercentage = 0.01;

      const maxAmount = calculateMaxAmount(balance, feePercentage);
      const fee = calculateFee(maxAmount, feePercentage);
      const total = maxAmount + fee;

      expect(total).toBeLessThanOrEqual(balance);
      // Verify we have 6 decimal precision at most
      const decimals = (maxAmount.toString().split(".")[1] || "").length;
      expect(decimals).toBeLessThanOrEqual(6);
    });

    it("should handle 9 decimal tokens (SOL-like)", () => {
      const balance = 12.345678901;
      const feePercentage = 0.01;

      const maxAmount = calculateMaxAmount(balance, feePercentage);
      const fee = calculateFee(maxAmount, feePercentage);
      const total = maxAmount + fee;

      expect(total).toBeLessThanOrEqual(balance);
    });

    it("should handle 0 balance", () => {
      const balance = 0;
      const feePercentage = 0.01;

      const maxAmount = calculateMaxAmount(balance, feePercentage);

      expect(maxAmount).toBe(0);
    });

    it("should handle negative balance gracefully", () => {
      const balance = -100;
      const feePercentage = 0.01;

      const maxAmount = calculateMaxAmount(balance, feePercentage);

      expect(maxAmount).toBe(-100); // Returns balance as-is for invalid input
    });
  });

  describe("Route 997 scenario simulation", () => {
    it("should prevent selecting amount that causes insufficient funds", () => {
      // Route 997's actual scenario:
      // User had 1,849,611.54 tokens
      // They tried to route 1,849,611 tokens
      // Fee was 1% = 18,496.11 tokens
      // Total needed = 1,868,107.11 tokens
      // INSUFFICIENT FUNDS!

      const balance = 1849611.54;
      const feePercentage = 0.01;
      const attemptedAmount = 1849611; // What user tried to route

      const maxAmount = calculateMaxAmount(balance, feePercentage);
      const feeForAttempted = calculateFee(attemptedAmount, feePercentage);
      const totalForAttempted = attemptedAmount + feeForAttempted;

      // The attempted amount would exceed balance
      expect(totalForAttempted).toBeGreaterThan(balance);

      // But our maxAmount should be safe
      const feeForMax = calculateFee(maxAmount, feePercentage);
      const totalForMax = maxAmount + feeForMax;
      expect(totalForMax).toBeLessThanOrEqual(balance);

      // maxAmount should be significantly less than what user tried
      expect(maxAmount).toBeLessThan(attemptedAmount);
    });

    it("maxAmount + fee should never exceed balance", () => {
      // Test with many different balances
      const testCases = [
        { balance: 100, fee: 0.01 },
        { balance: 1000, fee: 0.01 },
        { balance: 1849611.54, fee: 0.01 }, // Route 997
        { balance: 0.001, fee: 0.01 },
        { balance: 999999999, fee: 0.01 },
        { balance: 100, fee: 0.05 }, // 5% fee
        { balance: 100, fee: 0.001 }, // 0.1% fee
      ];

      for (const { balance, fee } of testCases) {
        const maxAmount = calculateMaxAmount(balance, fee);
        const feeAmount = calculateFee(maxAmount, fee);
        const total = maxAmount + feeAmount;

        expect(total).toBeLessThanOrEqual(
          balance,
          `Failed for balance=${balance}, fee=${fee}: total ${total} > balance ${balance}`
        );
      }
    });

    it("should calculate exact values for Route 997 scenario", () => {
      const balance = 1849611.54;
      const feePercentage = 0.01;

      const maxAmount = calculateMaxAmount(balance, feePercentage);

      // Expected: 1849611.54 / 1.01 = 1831298.554455...
      // After floor to 6 decimals: 1831298.554455
      expect(maxAmount).toBeLessThan(1831298.56);
      expect(maxAmount).toBeGreaterThan(1831298.55);

      // Verify the total
      const fee = calculateFee(maxAmount, feePercentage);
      const total = maxAmount + fee;
      expect(total).toBeLessThanOrEqual(balance);
    });
  });

  describe("Precision tests", () => {
    it("should not lose precision with floating point math", () => {
      const balance = 123.456789;
      const feePercentage = 0.01;

      const maxAmount = calculateMaxAmount(balance, feePercentage);

      // Should have at most 6 decimal places
      const decimalPlaces = (maxAmount.toString().split(".")[1] || "").length;
      expect(decimalPlaces).toBeLessThanOrEqual(6);
    });

    it("should handle amounts with many decimal places", () => {
      const balance = 100.123456789012345;
      const feePercentage = 0.01;

      const maxAmount = calculateMaxAmount(balance, feePercentage);
      const fee = calculateFee(maxAmount, feePercentage);
      const total = maxAmount + fee;

      expect(total).toBeLessThanOrEqual(balance);
    });

    it("should produce consistent results across multiple calculations", () => {
      const balance = 1000;
      const feePercentage = 0.01;

      const results = Array(100)
        .fill(0)
        .map(() => calculateMaxAmount(balance, feePercentage));

      // All results should be identical
      expect(new Set(results).size).toBe(1);
    });

    it("should handle fee percentages with many decimal places", () => {
      const balance = 1000;
      const feePercentage = 0.0123456789; // Unusual fee percentage

      const maxAmount = calculateMaxAmount(balance, feePercentage);
      const fee = calculateFee(maxAmount, feePercentage);
      const total = maxAmount + fee;

      expect(total).toBeLessThanOrEqual(balance);
    });
  });

  describe("Percentage button calculations", () => {
    it("25% of maxAmount should be safe to route", () => {
      const balance = 1000;
      const feePercentage = 0.01;
      const maxAmount = calculateMaxAmount(balance, feePercentage);

      const twentyFivePercent = maxAmount * 0.25;
      const fee = calculateFee(twentyFivePercent, feePercentage);
      const total = twentyFivePercent + fee;

      expect(total).toBeLessThanOrEqual(balance);
    });

    it("50% of maxAmount should be safe to route", () => {
      const balance = 1000;
      const feePercentage = 0.01;
      const maxAmount = calculateMaxAmount(balance, feePercentage);

      const fiftyPercent = maxAmount * 0.5;
      const fee = calculateFee(fiftyPercent, feePercentage);
      const total = fiftyPercent + fee;

      expect(total).toBeLessThanOrEqual(balance);
    });

    it("100% (Max) of maxAmount should be safe to route", () => {
      const balance = 1000;
      const feePercentage = 0.01;
      const maxAmount = calculateMaxAmount(balance, feePercentage);

      const fee = calculateFee(maxAmount, feePercentage);
      const total = maxAmount + fee;

      expect(total).toBeLessThanOrEqual(balance);
    });
  });
});
