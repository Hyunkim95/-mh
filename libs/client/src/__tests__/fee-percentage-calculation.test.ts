import { describe, it, expect } from "vitest";

/**
 * Tests for fee percentage calculation from token config.
 *
 * The backend returns feeBps (basis points) differently for SPL vs SOL:
 * - SPL: Already divided by 10,000 (e.g., "0.01" for 1%)
 * - SOL: Raw basis points (e.g., "100" for 1%)
 *
 * Frontend must handle both correctly.
 */

// Default fee percentage used when config unavailable
const DEFAULT_FEE_PERCENTAGE = 0.01;

// Simulate the fee percentage calculation from ConfigureHops.tsx
function calculateFeePercentage(
  tokenType: "SPL" | "SOL",
  tokenConfigSPL: { data?: { feeBps?: string } } | null | undefined,
  tokenConfigSOL: { data?: { feeBps?: string } } | null | undefined
): number {
  if (tokenType === "SPL" && tokenConfigSPL?.data?.feeBps) {
    // feeBps is already divided by 10,000 in backend for SPL
    return parseFloat(tokenConfigSPL.data.feeBps);
  }
  if (tokenType === "SOL" && tokenConfigSOL?.data?.feeBps) {
    // feeBps is raw basis points for SOL, need to divide by 10,000
    return parseFloat(tokenConfigSOL.data.feeBps) / 10_000;
  }
  return DEFAULT_FEE_PERCENTAGE;
}

describe("feePercentage calculation from token config", () => {
  describe("SPL token config", () => {
    it("should parse feeBps correctly (already divided by 10,000)", () => {
      const tokenConfigSPL = { data: { feeBps: "0.01" } }; // 1%

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBe(0.01);
    });

    it("should handle 100 bps (1%)", () => {
      // Backend divides 100 by 10000 = 0.01
      const tokenConfigSPL = { data: { feeBps: "0.01" } };

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBe(0.01);
    });

    it("should handle 50 bps (0.5%)", () => {
      // Backend divides 50 by 10000 = 0.005
      const tokenConfigSPL = { data: { feeBps: "0.005" } };

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBe(0.005);
    });

    it("should handle 500 bps (5%)", () => {
      // Backend divides 500 by 10000 = 0.05
      const tokenConfigSPL = { data: { feeBps: "0.05" } };

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBe(0.05);
    });

    it("should handle very small fees (1 bp = 0.01%)", () => {
      const tokenConfigSPL = { data: { feeBps: "0.0001" } };

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
    it("should use default 1% when SPL config unavailable", () => {
      const feePercentage = calculateFeePercentage("SPL", null, null);

      expect(feePercentage).toBe(DEFAULT_FEE_PERCENTAGE);
    });

    it("should use default 1% when SOL config unavailable", () => {
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

    it("should handle very precise fee values", () => {
      const tokenConfigSPL = { data: { feeBps: "0.0123456789" } };

      const feePercentage = calculateFeePercentage("SPL", tokenConfigSPL, null);

      expect(feePercentage).toBeCloseTo(0.0123456789, 10);
    });

    it("should ignore SOL config when token type is SPL", () => {
      const tokenConfigSPL = { data: { feeBps: "0.02" } }; // 2%
      const tokenConfigSOL = { data: { feeBps: "500" } }; // 5%

      const feePercentage = calculateFeePercentage(
        "SPL",
        tokenConfigSPL,
        tokenConfigSOL
      );

      expect(feePercentage).toBe(0.02); // Should use SPL config
    });

    it("should ignore SPL config when token type is SOL", () => {
      const tokenConfigSPL = { data: { feeBps: "0.02" } }; // 2%
      const tokenConfigSOL = { data: { feeBps: "500" } }; // 5%

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
      // SPL: backend already converted to 0.01
      const splFee = calculateFeePercentage(
        "SPL",
        { data: { feeBps: "0.01" } },
        null
      );

      // SOL: raw 100 bps, frontend converts
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
        { data: { feeBps: "0.05" } },
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
