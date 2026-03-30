import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  validateEasyRouteInput: vi.fn(),
  createEasyRoute: vi.fn(),
}));

vi.mock("../routes/services/easy-route.service", () => ({
  createEasyRouteService: () => ({
    validateEasyRouteInput: mocks.validateEasyRouteInput,
    createEasyRoute: mocks.createEasyRoute,
  }),
}));

vi.mock("../db", () => ({
  db: {},
}));

vi.mock("@libs/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { easyRoutesRouter } from "../routers/easy-routes.router";

const caller = easyRoutesRouter.createCaller({} as any);

const CREATOR = "11111111111111111111111111111111";
const DESTINATION = "22222222222222222222222222222222";

const easyRouteInput = {
  arrivalTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  hopCount: 3,
  destinationWallet: DESTINATION,
  tokenType: "SOL" as const,
  tokenDecimals: 9,
  hopAmountTokens: "1.0",
  hopAmountRaw: "1000000000",
  creator: CREATOR,
};

describe("easyRoutesRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("creates an easy route on valid input", async () => {
      mocks.validateEasyRouteInput.mockResolvedValue({
        isValid: true,
        errors: [],
      });
      mocks.createEasyRoute.mockResolvedValue({ id: 1, name: "Easy Route" });

      const result = await caller.create(easyRouteInput);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(1);
    });

    it("throws when validation fails", async () => {
      mocks.validateEasyRouteInput.mockResolvedValue({
        isValid: false,
        errors: ["Too many hops"],
      });

      await expect(caller.create(easyRouteInput)).rejects.toThrow(
        "Easy Route validation failed"
      );
    });

    it("throws on service error", async () => {
      mocks.validateEasyRouteInput.mockResolvedValue({
        isValid: true,
        errors: [],
      });
      mocks.createEasyRoute.mockRejectedValue(new Error("db error"));

      await expect(caller.create(easyRouteInput)).rejects.toThrow("db error");
    });
  });

  describe("validate", () => {
    const validateInput = {
      arrivalTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      hopCount: 3,
      destinationWallet: DESTINATION,
      tokenType: "SOL" as const,
      tokenDecimals: 9,
      hopAmountTokens: "1.0",
      hopAmountRaw: "1000000000",
    };

    it("returns validation result", async () => {
      mocks.validateEasyRouteInput.mockResolvedValue({
        isValid: true,
        errors: [],
      });

      const result = await caller.validate(validateInput);

      expect(result.success).toBe(true);
      expect(result.data.isValid).toBe(true);
    });

    it("returns error result on service failure", async () => {
      mocks.validateEasyRouteInput.mockRejectedValue(
        new Error("service error")
      );

      const result = await caller.validate(validateInput);

      expect(result.success).toBe(false);
      expect(result.data.isValid).toBe(false);
    });
  });
});
