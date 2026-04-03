import { describe, it, expect } from "vitest";

/**
 * Tests for fee percentage calculation from token config.
 *
 * Both SPL and SOL endpoints return feeBps as raw basis points (e.g., "100" for 1%).
 * Frontend divides by 10,000 to get the decimal fee rate.
 */

// Default fee percentage used when config unavailable
const DEFAULT_FEE_PERCENTAGE = 0.005;

// Simulate the fee percentage calculation from ConfigureHops.tsx
function calculateFeePercentage(
  tokenType: "SPL" | "SOL",
  tokenConfigSPL: { data?: { feeBps?: string } } | null | undefined,
  tokenConfigSOL: { data?: { feeBps?: string } } | null | undefined
): number {
  if (tokenType === "SPL" && tokenConfigSPL?.data?.feeBps) {
    // feeBps is raw basis points, divide by 10_000 to get decimal
    return parseFloat(tokenConfigSPL.data.feeBps) / 10_000;
  }
  if (tokenType === "SOL" && tokenConfigSOL?.data?.feeBps) {
    // feeBps is raw basis points, divide by 10_000 to get decimal
    return parseFloat(tokenConfigSOL.data.feeBps) / 10_000;
  }
  return DEFAULT_FEE_PERCENTAGE;
}

describe("feePercentage calculation from token config", () => {
  describe("SPL token config", () => {
    it("should divide raw feeBps by 10,000", () => {
      const tokenConfigSPL = { data: { feeBps: "100" } }; // 100 bps = 1%

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBe(0.01);
    });

    it("should handle 100 bps -> 0.01 (1%)", () => {
      const tokenConfigSPL = { data: { feeBps: "100" } };

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBe(0.01);
    });

    it("should handle 50 bps -> 0.005 (0.5%)", () => {
      const tokenConfigSPL = { data: { feeBps: "50" } };

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBe(0.005);
    });

    it("should handle 500 bps -> 0.05 (5%)", () => {
      const tokenConfigSPL = { data: { feeBps: "500" } };

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBe(0.05);
    });

    it("should handle very small fees (1 bp = 0.01%)", () => {
      const tokenConfigSPL = { data: { feeBps: "1" } };

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBe(0.0001);
    });

    it("should handle zero fee", () => {
      const tokenConfigSPL = { data: { feeBps: "0" } };

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBe(0);
    });
  });

  describe("SOL token config", () => {
    it("should divide raw feeBps by 10,000", () => {
      // SOL returns raw basis points
      const tokenConfigSOL = { data: { feeBps: "100" } }; // 100 bps = 1%

      const feePercentage = calculateFeePercentage("SOL", null, tokenConfigSOL);

      expect(feePercentage).toBe(0.01);
    });

    it("should handle 100 bps -> 0.01 (1%)", () => {
      const tokenConfigSOL = { data: { feeBps: "100" } };

      const feePercentage = calculateFeePercentage("SOL", null, tokenConfigSOL);

      expect(feePercentage).toBe(0.01);
    });

    it("should handle 50 bps -> 0.005 (0.5%)", () => {
      const tokenConfigSOL = { data: { feeBps: "50" } };

      const feePercentage = calculateFeePercentage("SOL", null, tokenConfigSOL);

      expect(feePercentage).toBe(0.005);
    });

    it("should handle 500 bps -> 0.05 (5%)", () => {
      const tokenConfigSOL = { data: { feeBps: "500" } };

      const feePercentage = calculateFeePercentage("SOL", null, tokenConfigSOL);

      expect(feePercentage).toBe(0.05);
    });

    it("should handle 1 bp -> 0.0001 (0.01%)", () => {
      const tokenConfigSOL = { data: { feeBps: "1" } };

      const feePercentage = calculateFeePercentage("SOL", null, tokenConfigSOL);

      expect(feePercentage).toBe(0.0001);
    });

    it("should handle zero fee", () => {
      const tokenConfigSOL = { data: { feeBps: "0" } };

      const feePercentage = calculateFeePercentage("SOL", null, tokenConfigSOL);

      expect(feePercentage).toBe(0);
    });
  });

  describe("Fallback behavior", () => {
    it("should use default 0.5% when SPL config unavailable", () => {
      const feePercentage = calculateFeePercentage("SPL", null, null);

      expect(feePercentage).toBe(DEFAULT_FEE_PERCENTAGE);
    });

    it("should use default 0.5% when SOL config unavailable", () => {
      const feePercentage = calculateFeePercentage("SOL", null, null);

      expect(feePercentage).toBe(DEFAULT_FEE_PERCENTAGE);
    });

    it("should use default when feeBps is null", () => {
      const tokenConfigSPL = { data: { feeBps: null as any } };

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBe(DEFAULT_FEE_PERCENTAGE);
    });

    it("should use default when feeBps is undefined", () => {
      const tokenConfigSPL = { data: {} };

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBe(DEFAULT_FEE_PERCENTAGE);
    });

    it("should use default when feeBps is empty string", () => {
      const tokenConfigSPL = { data: { feeBps: "" } };

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      // parseFloat("") returns NaN, which is falsy, so should fall back
      expect(feePercentage).toBe(DEFAULT_FEE_PERCENTAGE);
    });

    it("should use default when data is null", () => {
      const tokenConfigSPL = { data: null as any };

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBe(DEFAULT_FEE_PERCENTAGE);
    });

    it("should use default when config object is undefined", () => {
      const feePercentage = calculateFeePercentage("SPL", undefined, undefined);

      expect(feePercentage).toBe(DEFAULT_FEE_PERCENTAGE);
    });
  });

  describe("Edge cases", () => {
    it("should handle feeBps as number string with decimals", () => {
      const tokenConfigSOL = { data: { feeBps: "100.5" } }; // 100.5 bps

      const feePercentage = calculateFeePercentage("SOL", null, tokenConfigSOL);

      expect(feePercentage).toBeCloseTo(0.01005, 6);
    });

    it("should handle large fee percentages", () => {
      const tokenConfigSOL = { data: { feeBps: "5000" } }; // 50%

      const feePercentage = calculateFeePercentage("SOL", null, tokenConfigSOL);

      expect(feePercentage).toBe(0.5);
    });

    it("should handle very precise fee values for SPL", () => {
      const tokenConfigSPL = { data: { feeBps: "123" } }; // 123 bps = 1.23%

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBeCloseTo(0.0123, 10);
    });

    it("should ignore SOL config when token type is SPL", () => {
      const tokenConfigSPL = { data: { feeBps: "200" } }; // 200 bps = 2%
      const tokenConfigSOL = { data: { feeBps: "500" } }; // 500 bps = 5%

      const feePercentage = calculateFeePercentage(
        "SPL",
        tokenConfigSPL,
        tokenConfigSOL
      );

      expect(feePercentage).toBe(0.02); // Should use SPL config
    });

    it("should ignore SPL config when token type is SOL", () => {
      const tokenConfigSPL = { data: { feeBps: "200" } }; // 200 bps = 2%
      const tokenConfigSOL = { data: { feeBps: "500" } }; // 500 bps = 5%

      const feePercentage = calculateFeePercentage(
        "SOL",
        tokenConfigSPL,
        tokenConfigSOL
      );

      expect(feePercentage).toBe(0.05); // Should use SOL config
    });
  });

  describe("Consistency between SPL and SOL formats", () => {
    it("100 bps should equal 1% for both token types", () => {
      // Both SPL and SOL now return raw basis points
      const splFee = calculateFeePercentage(
        "SPL",
        { data: { feeBps: "100" } },
        null
      );

      const solFee = calculateFeePercentage(
        "SOL",
        null,
        { data: { feeBps: "100" } }
      );

      expect(splFee).toBe(0.01);
      expect(solFee).toBe(0.01);
      expect(splFee).toBe(solFee);
    });

    it("500 bps should equal 5% for both token types", () => {
      const splFee = calculateFeePercentage(
        "SPL",
        { data: { feeBps: "500" } },
        null
      );

      const solFee = calculateFeePercentage(
        "SOL",
        null,
        { data: { feeBps: "500" } }
      );

      expect(splFee).toBe(0.05);
      expect(solFee).toBe(0.05);
      expect(splFee).toBe(solFee);
    });
  });
});
