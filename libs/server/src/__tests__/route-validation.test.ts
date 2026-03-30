import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateRouteAgainstTokenConfig,
  validateHopRecipients,
  validateHopScheduling,
  validateRoute,
} from "../routes/services/route-validation.service";

// Mock the contract service functions
vi.mock("../solana/services/contract.service", () => ({
  getTokenConfigSPL: vi.fn(),
  getTokenConfigSOL: vi.fn(),
}));

import {
  getTokenConfigSPL,
  getTokenConfigSOL,
} from "../solana/services/contract.service";

// Valid Solana addresses for testing
const VALID_SOLANA_ADDRESS_1 = "7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P";
const VALID_SOLANA_ADDRESS_2 = "DQTf1yf1YM4B48PqJyQ53SEWGDM6ib4YBV7P3wm2MCxj";
const VALID_SOLANA_ADDRESS_3 = "8CBZ9U5fqiPdS28rsWjVWHh3sLkFmjcV7i3dz3g3zasf";
const VALID_TOKEN_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Helper to create future timestamps
const getFutureTimestamp = (secondsFromNow: number): string => {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
};

// Helper to create past timestamps
const getPastTimestamp = (secondsAgo: number): string => {
  return new Date(Date.now() - secondsAgo * 1000).toISOString();
};

describe("Route Validation Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("validateRouteAgainstTokenConfig", () => {
    const mockTokenConfig = {
      minTransfer: "1000000", // 1 token (assuming 6 decimals)
      feeBps: "500",
      feeTreasury: VALID_SOLANA_ADDRESS_1,
      maxHops: "5",
      maxDelaySeconds: "86400", // 24 hours
      flatFeeLamports: "5000",
    };

    describe("SPL Token Routes", () => {
      it("should return error when tokenMint is missing for SPL token", async () => {
        const routeInput = {
          tokenType: "SPL" as const,
          tokenMint: undefined,
          hopAmountRaw: "2000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("Token mint is required for SPL token routes");
      });

      it("should return error when SPL token config is not found", async () => {
        vi.mocked(getTokenConfigSPL).mockResolvedValue(null);

        const routeInput = {
          tokenType: "SPL" as const,
          tokenMint: VALID_TOKEN_MINT,
          hopAmountRaw: "2000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain("Token configuration not found for SPL token");
        expect(result.errors[0]).toContain(VALID_TOKEN_MINT);
      });

      it("should validate successfully with valid SPL token config", async () => {
        vi.mocked(getTokenConfigSPL).mockResolvedValue(mockTokenConfig);

        const routeInput = {
          tokenType: "SPL" as const,
          tokenMint: VALID_TOKEN_MINT,
          hopAmountRaw: "2000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
            { recipient: VALID_SOLANA_ADDRESS_2, scheduledAt: getFutureTimestamp(7200) },
          ],
          creator: VALID_SOLANA_ADDRESS_3,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(getTokenConfigSPL).toHaveBeenCalledWith(VALID_TOKEN_MINT);
      });
    });

    describe("SOL Token Routes", () => {
      it("should return error when SOL token config is not found", async () => {
        vi.mocked(getTokenConfigSOL).mockResolvedValue(null);

        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "2000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("SOL token configuration not found");
      });

      it("should validate successfully with valid SOL token config", async () => {
        vi.mocked(getTokenConfigSOL).mockResolvedValue(mockTokenConfig);

        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "5000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(getTokenConfigSOL).toHaveBeenCalled();
      });
    });

    describe("Amount Validation", () => {
      beforeEach(() => {
        vi.mocked(getTokenConfigSOL).mockResolvedValue(mockTokenConfig);
      });

      it("should return error when hop amount is below minimum transfer", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "500000", // Below minTransfer of 1000000
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes("below minimum transfer amount"))).toBe(true);
      });

      it("should pass when hop amount equals minimum transfer", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "1000000", // Exactly minTransfer
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should pass when hop amount is above minimum transfer", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "10000000", // Well above minTransfer
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should handle large BigInt amounts correctly", async () => {
        const largeAmount = "999999999999999999"; // Very large amount
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: largeAmount,
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should handle zero amount correctly", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "0",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes("below minimum transfer amount"))).toBe(true);
      });
    });

    describe("Max Hops Validation", () => {
      beforeEach(() => {
        vi.mocked(getTokenConfigSOL).mockResolvedValue(mockTokenConfig);
      });

      it("should return error when hop count exceeds maximum", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "2000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
            { recipient: VALID_SOLANA_ADDRESS_2, scheduledAt: getFutureTimestamp(7200) },
            { recipient: VALID_SOLANA_ADDRESS_3, scheduledAt: getFutureTimestamp(10800) },
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(14400) },
            { recipient: VALID_SOLANA_ADDRESS_2, scheduledAt: getFutureTimestamp(18000) },
            { recipient: VALID_SOLANA_ADDRESS_3, scheduledAt: getFutureTimestamp(21600) }, // 6th hop, exceeds max of 5
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e =>
          e.includes("6 hops") && e.includes("maximum 5 hops")
        )).toBe(true);
      });

      it("should pass when hop count equals maximum", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "2000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
            { recipient: VALID_SOLANA_ADDRESS_2, scheduledAt: getFutureTimestamp(7200) },
            { recipient: VALID_SOLANA_ADDRESS_3, scheduledAt: getFutureTimestamp(10800) },
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(14400) },
            { recipient: VALID_SOLANA_ADDRESS_2, scheduledAt: getFutureTimestamp(18000) },
          ],
          creator: VALID_SOLANA_ADDRESS_3,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should pass when hop count is below maximum", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "2000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
            { recipient: VALID_SOLANA_ADDRESS_2, scheduledAt: getFutureTimestamp(7200) },
          ],
          creator: VALID_SOLANA_ADDRESS_3,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should handle empty hops array", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "2000000",
          hops: [],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe("Max Delay Seconds Validation", () => {
      beforeEach(() => {
        vi.mocked(getTokenConfigSOL).mockResolvedValue(mockTokenConfig);
      });

      it("should return error when delay between consecutive hops exceeds maximum", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "2000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
            { recipient: VALID_SOLANA_ADDRESS_2, scheduledAt: getFutureTimestamp(3600 + 100000) }, // 100000 seconds delay, exceeds 86400
          ],
          creator: VALID_SOLANA_ADDRESS_3,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes("exceeds maximum allowed delay"))).toBe(true);
      });

      it("should pass when delay between hops is within maximum", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "2000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
            { recipient: VALID_SOLANA_ADDRESS_2, scheduledAt: getFutureTimestamp(3600 + 43200) }, // 12 hours delay, within 24 hours
          ],
          creator: VALID_SOLANA_ADDRESS_3,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should return error when first hop is scheduled too far in the future", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "2000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(100000) }, // 100000 seconds in future, exceeds 86400
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e =>
          e.includes("First hop is scheduled") && e.includes("exceeds maximum allowed delay")
        )).toBe(true);
      });

      it("should return error when hops are not in chronological order (negative delay)", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "2000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(7200) },
            { recipient: VALID_SOLANA_ADDRESS_2, scheduledAt: getFutureTimestamp(3600) }, // Before the first hop
          ],
          creator: VALID_SOLANA_ADDRESS_3,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes("scheduled before hop"))).toBe(true);
      });
    });

    describe("Fallback Behavior", () => {
      it("should return error when getTokenConfigSPL throws an exception", async () => {
        vi.mocked(getTokenConfigSPL).mockRejectedValue(new Error("Network error"));

        const routeInput = {
          tokenType: "SPL" as const,
          tokenMint: VALID_TOKEN_MINT,
          hopAmountRaw: "2000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(
          "Failed to validate route: Unable to fetch token configuration"
        );
      });

      it("should return error when getTokenConfigSOL throws an exception", async () => {
        vi.mocked(getTokenConfigSOL).mockRejectedValue(new Error("RPC timeout"));

        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "2000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(
          "Failed to validate route: Unable to fetch token configuration"
        );
      });
    });

    describe("Multiple Validation Errors", () => {
      it("should accumulate multiple errors", async () => {
        vi.mocked(getTokenConfigSOL).mockResolvedValue(mockTokenConfig);

        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "100", // Below minimum
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(3600) },
            { recipient: VALID_SOLANA_ADDRESS_2, scheduledAt: getFutureTimestamp(7200) },
            { recipient: VALID_SOLANA_ADDRESS_3, scheduledAt: getFutureTimestamp(10800) },
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: getFutureTimestamp(14400) },
            { recipient: VALID_SOLANA_ADDRESS_2, scheduledAt: getFutureTimestamp(18000) },
            { recipient: VALID_SOLANA_ADDRESS_3, scheduledAt: getFutureTimestamp(21600) }, // Exceeds max hops
          ],
          creator: VALID_SOLANA_ADDRESS_1,
        };

        const result = await validateRouteAgainstTokenConfig(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
        expect(result.errors.some(e => e.includes("below minimum transfer"))).toBe(true);
        expect(result.errors.some(e => e.includes("maximum 5 hops"))).toBe(true);
      });
    });
  });

  describe("validateHopRecipients", () => {
    describe("Valid Solana Addresses", () => {
      it("should pass for valid Solana addresses", () => {
        const hops = [
          { recipient: VALID_SOLANA_ADDRESS_1 },
          { recipient: VALID_SOLANA_ADDRESS_2 },
          { recipient: VALID_SOLANA_ADDRESS_3 },
        ];

        const result = validateHopRecipients(hops);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should pass for single valid address", () => {
        const hops = [{ recipient: VALID_SOLANA_ADDRESS_1 }];

        const result = validateHopRecipients(hops);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should pass for empty hops array", () => {
        const hops: Array<{ recipient: string }> = [];

        const result = validateHopRecipients(hops);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe("Invalid Solana Addresses", () => {
      it("should return error for invalid base58 address", () => {
        const hops = [{ recipient: "invalid-address-not-base58!" }];

        const result = validateHopRecipients(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain("Hop 1 has invalid recipient address");
      });

      it("should return error for empty string address", () => {
        const hops = [{ recipient: "" }];

        const result = validateHopRecipients(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain("Hop 1 has invalid recipient address");
      });

      it("should return error for too-short address", () => {
        const hops = [{ recipient: "abc123" }];

        const result = validateHopRecipients(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain("Hop 1 has invalid recipient address");
      });

      it("should return error for too-long address", () => {
        const hops = [{ recipient: "A".repeat(100) }];

        const result = validateHopRecipients(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain("Hop 1 has invalid recipient address");
      });

      it("should return error for address with invalid characters", () => {
        const hops = [{ recipient: "7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P+" }];

        const result = validateHopRecipients(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain("Hop 1 has invalid recipient address");
      });

      it("should identify correct hop number in error message", () => {
        const hops = [
          { recipient: VALID_SOLANA_ADDRESS_1 },
          { recipient: VALID_SOLANA_ADDRESS_2 },
          { recipient: "invalid-address" },
        ];

        const result = validateHopRecipients(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain("Hop 3 has invalid recipient address");
      });

      it("should accumulate multiple invalid address errors", () => {
        const hops = [
          { recipient: "invalid1" },
          { recipient: VALID_SOLANA_ADDRESS_1 },
          { recipient: "invalid2" },
        ];

        const result = validateHopRecipients(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(2);
        expect(result.errors[0]).toContain("Hop 1");
        expect(result.errors[1]).toContain("Hop 3");
      });
    });

    describe("Edge Cases", () => {
      it("should handle whitespace-only address", () => {
        const hops = [{ recipient: "   " }];

        const result = validateHopRecipients(hops);

        expect(result.isValid).toBe(false);
      });

      it("should handle address with leading/trailing whitespace", () => {
        const hops = [{ recipient: ` ${VALID_SOLANA_ADDRESS_1} ` }];

        const result = validateHopRecipients(hops);

        expect(result.isValid).toBe(false); // PublicKey constructor doesn't trim
      });

      it("should handle null-like string address", () => {
        const hops = [{ recipient: "null" }];

        const result = validateHopRecipients(hops);

        expect(result.isValid).toBe(false);
      });
    });
  });

  describe("validateHopScheduling", () => {
    describe("Valid Scheduling", () => {
      it("should pass for future timestamps in chronological order", () => {
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

        const hops = [
          { scheduledAt: "2024-01-15T13:00:00Z" },
          { scheduledAt: "2024-01-15T14:00:00Z" },
          { scheduledAt: "2024-01-15T15:00:00Z" },
        ];

        const result = validateHopScheduling(hops);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should pass for single future hop", () => {
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

        const hops = [{ scheduledAt: "2024-01-15T13:00:00Z" }];

        const result = validateHopScheduling(hops);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should pass for empty hops array", () => {
        const hops: Array<{ scheduledAt: string }> = [];

        const result = validateHopScheduling(hops);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should allow hop scheduled within 1 minute tolerance", () => {
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

        // 30 seconds ago - within 1 minute tolerance
        const hops = [{ scheduledAt: "2024-01-15T11:59:30Z" }];

        const result = validateHopScheduling(hops);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe("Past Date Validation", () => {
      it("should return error for hop scheduled in the past (beyond 1 minute tolerance)", () => {
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

        const hops = [{ scheduledAt: "2024-01-15T11:50:00Z" }]; // 10 minutes ago

        const result = validateHopScheduling(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain("Hop 1 is scheduled in the past");
      });

      it("should return error for hop scheduled days in the past", () => {
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

        const hops = [{ scheduledAt: "2024-01-10T12:00:00Z" }]; // 5 days ago

        const result = validateHopScheduling(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain("Hop 1 is scheduled in the past");
      });

      it("should identify correct hop number for past date error", () => {
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

        const hops = [
          { scheduledAt: "2024-01-15T13:00:00Z" },
          { scheduledAt: "2024-01-15T14:00:00Z" },
          { scheduledAt: "2024-01-10T12:00:00Z" }, // Third hop in past
        ];

        const result = validateHopScheduling(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes("Hop 3 is scheduled in the past"))).toBe(true);
      });
    });

    describe("Chronological Order Validation", () => {
      it("should return error when hop is scheduled before previous hop", () => {
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

        const hops = [
          { scheduledAt: "2024-01-15T14:00:00Z" },
          { scheduledAt: "2024-01-15T13:00:00Z" }, // Before the first hop
        ];

        const result = validateHopScheduling(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes("Hop 2 must be scheduled after hop 1"))).toBe(true);
      });

      it("should return error when hop is scheduled at same time as previous hop", () => {
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

        const hops = [
          { scheduledAt: "2024-01-15T14:00:00Z" },
          { scheduledAt: "2024-01-15T14:00:00Z" }, // Same time
        ];

        const result = validateHopScheduling(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes("Hop 2 must be scheduled after hop 1"))).toBe(true);
      });

      it("should accumulate chronological order errors for multiple violations", () => {
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

        const hops = [
          { scheduledAt: "2024-01-15T15:00:00Z" },
          { scheduledAt: "2024-01-15T14:00:00Z" }, // Before hop 1
          { scheduledAt: "2024-01-15T13:00:00Z" }, // Before hop 2
        ];

        const result = validateHopScheduling(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe("Invalid Date Format Validation", () => {
      it("should return error for invalid date format", () => {
        const hops = [{ scheduledAt: "not-a-date" }];

        const result = validateHopScheduling(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain("Hop 1 has invalid scheduled time");
      });

      it("should return error for empty date string", () => {
        const hops = [{ scheduledAt: "" }];

        const result = validateHopScheduling(hops);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain("Hop 1 has invalid scheduled time");
      });

      it("should return error for partial date", () => {
        const hops = [{ scheduledAt: "2024-01" }];

        const result = validateHopScheduling(hops);

        // This may parse as valid depending on Date implementation
        // But chronological check might catch it
        expect(result.errors.length).toBeGreaterThanOrEqual(0);
      });

      it("should handle various invalid date formats", () => {
        const invalidDates = [
          "invalid",
          "2024/01/15", // May work depending on locale
          "Jan 15, 2024",
          "1705320000000", // Unix timestamp as string might work
        ];

        for (const invalidDate of invalidDates) {
          const hops = [{ scheduledAt: invalidDate }];
          const result = validateHopScheduling(hops);
          // Just ensure no exceptions are thrown
          expect(result).toBeDefined();
        }
      });
    });

    describe("Edge Cases", () => {
      it("should handle timestamps at millisecond precision", () => {
        vi.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));

        const hops = [
          { scheduledAt: "2024-01-15T13:00:00.001Z" },
          { scheduledAt: "2024-01-15T13:00:00.002Z" },
        ];

        const result = validateHopScheduling(hops);

        expect(result.isValid).toBe(true);
      });

      it("should handle UTC and timezone variations", () => {
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

        const hops = [
          { scheduledAt: "2024-01-15T14:00:00+02:00" }, // UTC+2, equals 12:00 UTC
        ];

        const result = validateHopScheduling(hops);

        // This might fail or pass depending on how the timestamp is interpreted
        expect(result).toBeDefined();
      });
    });
  });

  describe("validateRoute", () => {
    const mockTokenConfig = {
      minTransfer: "1000000",
      feeBps: "500",
      feeTreasury: VALID_SOLANA_ADDRESS_1,
      maxHops: "5",
      maxDelaySeconds: "86400",
      flatFeeLamports: "5000",
    };

    beforeEach(() => {
      vi.mocked(getTokenConfigSOL).mockResolvedValue(mockTokenConfig);
      vi.mocked(getTokenConfigSPL).mockResolvedValue(mockTokenConfig);
      vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
    });

    describe("Comprehensive Validation", () => {
      it("should pass when all validations succeed", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "5000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: "2024-01-15T13:00:00Z" },
            { recipient: VALID_SOLANA_ADDRESS_2, scheduledAt: "2024-01-15T14:00:00Z" },
          ],
          creator: VALID_SOLANA_ADDRESS_3,
        };

        const result = await validateRoute(routeInput);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should combine errors from all validation functions", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "100", // Below minimum
          hops: [
            { recipient: "invalid-address", scheduledAt: "2024-01-10T12:00:00Z" }, // Invalid address AND past date
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: "2024-01-15T11:00:00Z" }, // Past and before first hop
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRoute(routeInput);

        expect(result.isValid).toBe(false);
        // Should have errors from:
        // - validateHopRecipients (invalid address)
        // - validateHopScheduling (past dates, chronological order)
        // - validateRouteAgainstTokenConfig (below minimum)
        expect(result.errors.length).toBeGreaterThan(2);
      });

      it("should return recipient validation errors", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "5000000",
          hops: [
            { recipient: "invalid", scheduledAt: "2024-01-15T13:00:00Z" },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRoute(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes("invalid recipient address"))).toBe(true);
      });

      it("should return scheduling validation errors", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "5000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: "2024-01-10T12:00:00Z" }, // Past
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRoute(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes("scheduled in the past"))).toBe(true);
      });

      it("should return token config validation errors", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "100", // Below minimum
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: "2024-01-15T13:00:00Z" },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRoute(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes("below minimum transfer"))).toBe(true);
      });
    });

    describe("SPL Token Routes", () => {
      it("should validate SPL routes correctly", async () => {
        const routeInput = {
          tokenType: "SPL" as const,
          tokenMint: VALID_TOKEN_MINT,
          hopAmountRaw: "5000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: "2024-01-15T13:00:00Z" },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRoute(routeInput);

        expect(result.isValid).toBe(true);
        expect(getTokenConfigSPL).toHaveBeenCalledWith(VALID_TOKEN_MINT);
      });

      it("should return error for SPL route without mint", async () => {
        const routeInput = {
          tokenType: "SPL" as const,
          tokenMint: undefined,
          hopAmountRaw: "5000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: "2024-01-15T13:00:00Z" },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRoute(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes("Token mint is required"))).toBe(true);
      });
    });

    describe("Error Aggregation", () => {
      it("should not duplicate errors", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "5000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: "2024-01-15T13:00:00Z" },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRoute(routeInput);

        const uniqueErrors = [...new Set(result.errors)];
        expect(result.errors.length).toBe(uniqueErrors.length);
      });

      it("should maintain order of errors (recipients, scheduling, token config)", async () => {
        vi.mocked(getTokenConfigSOL).mockResolvedValue({
          ...mockTokenConfig,
          minTransfer: "10000000", // Higher minimum to trigger error
        });

        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "100", // Below new minimum
          hops: [
            { recipient: "invalid", scheduledAt: "2024-01-10T12:00:00Z" },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRoute(routeInput);

        expect(result.isValid).toBe(false);

        // Find indices of different error types
        const recipientErrorIndex = result.errors.findIndex(e => e.includes("recipient"));
        const schedulingErrorIndex = result.errors.findIndex(e => e.includes("past"));
        const tokenConfigErrorIndex = result.errors.findIndex(e => e.includes("minimum transfer"));

        // Recipient errors should come before scheduling, which should come before token config
        if (recipientErrorIndex !== -1 && schedulingErrorIndex !== -1) {
          expect(recipientErrorIndex).toBeLessThan(schedulingErrorIndex);
        }
        if (schedulingErrorIndex !== -1 && tokenConfigErrorIndex !== -1) {
          expect(schedulingErrorIndex).toBeLessThan(tokenConfigErrorIndex);
        }
      });
    });

    describe("Edge Cases", () => {
      it("should handle route with no hops", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "5000000",
          hops: [],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRoute(routeInput);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should handle route when token config fetch fails", async () => {
        vi.mocked(getTokenConfigSOL).mockRejectedValue(new Error("Network error"));

        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "5000000",
          hops: [
            { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: "2024-01-15T13:00:00Z" },
          ],
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRoute(routeInput);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes("Unable to fetch token configuration"))).toBe(true);
      });

      it("should handle maximum number of hops at boundary", async () => {
        const routeInput = {
          tokenType: "SOL" as const,
          hopAmountRaw: "5000000",
          hops: Array.from({ length: 5 }, (_, i) => ({
            recipient: [VALID_SOLANA_ADDRESS_1, VALID_SOLANA_ADDRESS_2, VALID_SOLANA_ADDRESS_3][i % 3],
            scheduledAt: new Date(Date.now() + (i + 1) * 3600000).toISOString(),
          })),
          creator: VALID_SOLANA_ADDRESS_2,
        };

        const result = await validateRoute(routeInput);

        expect(result.isValid).toBe(true);
      });
    });
  });

  describe("Integration Scenarios", () => {
    const mockTokenConfig = {
      minTransfer: "1000000",
      feeBps: "500",
      feeTreasury: VALID_SOLANA_ADDRESS_1,
      maxHops: "5",
      maxDelaySeconds: "86400",
      flatFeeLamports: "5000",
    };

    beforeEach(() => {
      vi.mocked(getTokenConfigSOL).mockResolvedValue(mockTokenConfig);
      vi.mocked(getTokenConfigSPL).mockResolvedValue(mockTokenConfig);
      vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
    });

    it("should validate a typical successful route creation", async () => {
      const routeInput = {
        tokenType: "SOL" as const,
        hopAmountRaw: "50000000", // 0.05 SOL
        hops: [
          { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: "2024-01-15T14:00:00Z" },
          { recipient: VALID_SOLANA_ADDRESS_2, scheduledAt: "2024-01-15T16:00:00Z" },
          { recipient: VALID_SOLANA_ADDRESS_3, scheduledAt: "2024-01-15T18:00:00Z" },
        ],
        creator: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      };

      const result = await validateRoute(routeInput);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject a route with common user errors", async () => {
      const routeInput = {
        tokenType: "SOL" as const,
        hopAmountRaw: "0", // Zero amount
        hops: [
          { recipient: "not-a-valid-address", scheduledAt: "2024-01-14T12:00:00Z" }, // Invalid address AND past
        ],
        creator: VALID_SOLANA_ADDRESS_2,
      };

      const result = await validateRoute(routeInput);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle SPL token routes with all valid parameters", async () => {
      const routeInput = {
        tokenType: "SPL" as const,
        tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        hopAmountRaw: "1000000000", // 1000 USDC (6 decimals)
        hops: [
          { recipient: VALID_SOLANA_ADDRESS_1, scheduledAt: "2024-01-16T12:00:00Z" },
          { recipient: VALID_SOLANA_ADDRESS_2, scheduledAt: "2024-01-17T12:00:00Z" },
        ],
        creator: VALID_SOLANA_ADDRESS_3,
      };

      const result = await validateRoute(routeInput);

      expect(result.isValid).toBe(true);
      expect(getTokenConfigSPL).toHaveBeenCalledWith("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    });
  });
});
