import { describe, it, expect } from "vitest";
import { lamportsToSol, solToLamports, formatSol } from "../utils";

describe("lamportsToSol", () => {
  it("converts 1 SOL in lamports", () => {
    expect(lamportsToSol(1_000_000_000)).toBe(1);
  });

  it("converts fractional SOL", () => {
    expect(lamportsToSol(500_000_000)).toBe(0.5);
  });

  it("converts 0 lamports", () => {
    expect(lamportsToSol(0)).toBe(0);
  });

  it("handles bigint input", () => {
    expect(lamportsToSol(BigInt(2_000_000_000))).toBe(2);
  });

  it("handles small amounts", () => {
    expect(lamportsToSol(1)).toBeCloseTo(0.000000001);
  });
});

describe("solToLamports", () => {
  it("converts 1 SOL", () => {
    expect(solToLamports(1)).toBe(1_000_000_000);
  });

  it("converts fractional SOL", () => {
    expect(solToLamports(0.5)).toBe(500_000_000);
  });

  it("floors result", () => {
    expect(solToLamports(0.0000000015)).toBe(1); // 1.5 lamports → 1
  });

  it("converts 0 SOL", () => {
    expect(solToLamports(0)).toBe(0);
  });
});

describe("formatSol", () => {
  it("formats with default 4 decimals", () => {
    expect(formatSol(1_500_000_000)).toBe("1.5000");
  });

  it("formats with custom decimals", () => {
    expect(formatSol(1_234_567_890, 2)).toBe("1.23");
  });

  it("formats zero", () => {
    expect(formatSol(0)).toBe("0.0000");
  });

  it("formats bigint", () => {
    expect(formatSol(BigInt(3_000_000_000), 1)).toBe("3.0");
  });
});
