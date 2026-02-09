import { describe, it, expect } from "vitest";

/**
 * Tests for maxAmount and submission-time fee deduction.
 *
 * UI behavior: maxAmount = full balance (user sees their entire balance)
 * Submission behavior: hopAmount = userAmount / (1 + feePercentage)
 * This ensures: hopAmount + (hopAmount * feePercentage) = userAmount
 *
 * Example with 1% fee and 1000 token balance:
 *   UI maxAmount = 1000 (user clicks Max, sees 1000)
 *   hopAmount = 1000 / 1.01 = 990.0990...
 *   fee = 990.099 * 0.01 = 9.900990
 *   total = 990.099 + 9.900990 = 1000.00 (user's full balance)
 */

// UI max amount: shows full balance
function calculateMaxAmount(balance: number): number {
  if (balance <= 0) return balance;
  return Math.floor(balance * 1e6) / 1e6;
}

// Submission-time fee deduction: actual hop amount sent on-chain
function calculateHopAmount(userAmount: number, feePercentage: number): number {
  if (feePercentage <= 0) return userAmount;
  const hopAmount = userAmount / (1 + feePercentage);
  return Math.floor(hopAmount * 1e6) / 1e6;
}

// Calculate the fee for a given amount
function calculateFee(amount: number, feePercentage: number): number {
  return amount * feePercentage;
}

describe("maxAmount calculation (UI display)", () => {
  it("should return full balance for UI display", () => {
    expect(calculateMaxAmount(1000)).toBe(1000);
    expect(calculateMaxAmount(1849611.54)).toBe(1849611.54);
    expect(calculateMaxAmount(0.5)).toBe(0.5);
  });

  it("should handle 0 balance", () => {
    expect(calculateMaxAmount(0)).toBe(0);
  });

  it("should handle negative balance gracefully", () => {
    expect(calculateMaxAmount(-100)).toBe(-100);
  });

  it("should floor to 6 decimal places", () => {
    const result = calculateMaxAmount(123.4567891);
    const decimals = (result.toString().split(".")[1] || "").length;
    expect(decimals).toBeLessThanOrEqual(6);
  });
});

describe("Submission-time fee deduction", () => {
  describe("Basic fee calculation", () => {
    it("should calculate hopAmount correctly with 1% fee", () => {
      const userAmount = 1000;
      const feePercentage = 0.01;

      const hopAmount = calculateHopAmount(userAmount, feePercentage);
      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;

      expect(hopAmount).toBeLessThan(userAmount);
      expect(total).toBeLessThanOrEqual(userAmount);
      expect(hopAmount).toBeCloseTo(990.099, 2);
    });

    it("should calculate hopAmount correctly with 0.5% fee", () => {
      const userAmount = 1000;
      const feePercentage = 0.005;

      const hopAmount = calculateHopAmount(userAmount, feePercentage);
      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;

      expect(total).toBeLessThanOrEqual(userAmount);
      expect(hopAmount).toBeCloseTo(995.024, 2);
    });

    it("should calculate hopAmount correctly with 5% fee", () => {
      const userAmount = 1000;
      const feePercentage = 0.05;

      const hopAmount = calculateHopAmount(userAmount, feePercentage);
      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;

      expect(total).toBeLessThanOrEqual(userAmount);
      expect(hopAmount).toBeCloseTo(952.38, 2);
    });

    it("should return full amount when feePercentage is 0", () => {
      const hopAmount = calculateHopAmount(1000, 0);
      expect(hopAmount).toBe(1000);
    });

    it("should return full amount when feePercentage is negative", () => {
      const hopAmount = calculateHopAmount(1000, -0.01);
      expect(hopAmount).toBe(1000);
    });
  });

  describe("Edge cases", () => {
    it("should handle very small amounts (< 1 token)", () => {
      const userAmount = 0.5;
      const feePercentage = 0.01;

      const hopAmount = calculateHopAmount(userAmount, feePercentage);
      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;

      expect(hopAmount).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(userAmount);
    });

    it("should handle very large amounts (billions of tokens)", () => {
      const userAmount = 1_000_000_000_000;
      const feePercentage = 0.01;

      const hopAmount = calculateHopAmount(userAmount, feePercentage);
      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;

      expect(hopAmount).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(userAmount);
    });

    it("should round down to prevent insufficient funds", () => {
      const userAmount = 100;
      const feePercentage = 0.01;

      const hopAmount = calculateHopAmount(userAmount, feePercentage);
      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;

      expect(total).toBeLessThanOrEqual(userAmount);
    });

    it("should handle 6 decimal tokens (USDC-like)", () => {
      const userAmount = 1849611.54;
      const feePercentage = 0.01;

      const hopAmount = calculateHopAmount(userAmount, feePercentage);
      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;

      expect(total).toBeLessThanOrEqual(userAmount);
      const decimals = (hopAmount.toString().split(".")[1] || "").length;
      expect(decimals).toBeLessThanOrEqual(6);
    });

    it("should handle 9 decimal tokens (SOL-like)", () => {
      const userAmount = 12.345678901;
      const feePercentage = 0.01;

      const hopAmount = calculateHopAmount(userAmount, feePercentage);
      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;

      expect(total).toBeLessThanOrEqual(userAmount);
    });
  });

  describe("Route 997 scenario simulation", () => {
    it("should prevent selecting amount that causes insufficient funds", () => {
      const balance = 1849611.54;
      const feePercentage = 0.01;

      // User clicks Max, sees full balance
      const maxAmount = calculateMaxAmount(balance);
      expect(maxAmount).toBe(1849611.54);

      // At submission, fee is deducted
      const hopAmount = calculateHopAmount(maxAmount, feePercentage);
      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;

      // Total should never exceed balance
      expect(total).toBeLessThanOrEqual(balance);
    });

    it("hopAmount + fee should never exceed user amount", () => {
      const testCases = [
        { amount: 100, fee: 0.01 },
        { amount: 1000, fee: 0.01 },
        { amount: 1849611.54, fee: 0.01 },
        { amount: 0.001, fee: 0.01 },
        { amount: 999999999, fee: 0.01 },
        { amount: 100, fee: 0.05 },
        { amount: 100, fee: 0.001 },
      ];

      for (const { amount, fee } of testCases) {
        const hopAmount = calculateHopAmount(amount, fee);
        const feeAmount = calculateFee(hopAmount, fee);
        const total = hopAmount + feeAmount;

        expect(total).toBeLessThanOrEqual(
          amount,
          `Failed for amount=${amount}, fee=${fee}: total ${total} > amount ${amount}`
        );
      }
    });

    it("should calculate exact values for Route 997 scenario", () => {
      const balance = 1849611.54;
      const feePercentage = 0.01;

      const hopAmount = calculateHopAmount(balance, feePercentage);

      // Expected: 1849611.54 / 1.01 = 1831298.554455...
      expect(hopAmount).toBeLessThan(1831298.56);
      expect(hopAmount).toBeGreaterThan(1831298.55);

      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;
      expect(total).toBeLessThanOrEqual(balance);
    });
  });

  describe("Precision tests", () => {
    it("should not lose precision with floating point math", () => {
      const hopAmount = calculateHopAmount(123.456789, 0.01);
      const decimalPlaces = (hopAmount.toString().split(".")[1] || "").length;
      expect(decimalPlaces).toBeLessThanOrEqual(6);
    });

    it("should handle amounts with many decimal places", () => {
      const userAmount = 100.123456789012345;
      const feePercentage = 0.01;

      const hopAmount = calculateHopAmount(userAmount, feePercentage);
      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;

      expect(total).toBeLessThanOrEqual(userAmount);
    });

    it("should produce consistent results across multiple calculations", () => {
      const results = Array(100)
        .fill(0)
        .map(() => calculateHopAmount(1000, 0.01));

      expect(new Set(results).size).toBe(1);
    });

    it("should handle fee percentages with many decimal places", () => {
      const userAmount = 1000;
      const feePercentage = 0.0123456789;

      const hopAmount = calculateHopAmount(userAmount, feePercentage);
      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;

      expect(total).toBeLessThanOrEqual(userAmount);
    });
  });

  describe("Percentage button calculations", () => {
    it("25% of balance should be safe after fee deduction at submission", () => {
      const balance = 1000;
      const feePercentage = 0.01;
      const maxAmount = calculateMaxAmount(balance);

      const twentyFivePercent = Math.round(maxAmount * 0.25 * 1e6) / 1e6;
      const hopAmount = calculateHopAmount(twentyFivePercent, feePercentage);
      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;

      expect(total).toBeLessThanOrEqual(balance);
    });

    it("50% of balance should be safe after fee deduction at submission", () => {
      const balance = 1000;
      const feePercentage = 0.01;
      const maxAmount = calculateMaxAmount(balance);

      const fiftyPercent = Math.round(maxAmount * 0.5 * 1e6) / 1e6;
      const hopAmount = calculateHopAmount(fiftyPercent, feePercentage);
      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;

      expect(total).toBeLessThanOrEqual(balance);
    });

    it("Max (100%) of balance should be safe after fee deduction at submission", () => {
      const balance = 1000;
      const feePercentage = 0.01;
      const maxAmount = calculateMaxAmount(balance);

      const hopAmount = calculateHopAmount(maxAmount, feePercentage);
      const fee = calculateFee(hopAmount, feePercentage);
      const total = hopAmount + fee;

      expect(total).toBeLessThanOrEqual(balance);
    });
  });
});
