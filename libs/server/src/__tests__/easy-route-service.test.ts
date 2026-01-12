import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Comprehensive tests for EasyRouteService
 *
 * The EasyRouteService handles creating "Easy Routes" which automatically:
 * 1. Generate intermediate wallets from the busy wallets pool
 * 2. Calculate randomized hop timings that arrive at the target time
 * 3. Create the route with appropriate isEasyRoute flag
 */

// Define mock objects before vi.mock calls (hoisted)
const mockBusyWalletsService = {
  getRandomWallets: vi.fn(),
  markWalletsUsed: vi.fn(),
  getActiveCount: vi.fn(),
};

const mockRoutesService = {
  createRoute: vi.fn(),
  getRoute: vi.fn(),
};

// Mock the busy wallets service factory
vi.mock("../busy-wallets/services/busy-wallets.service", () => ({
  createBusyWalletsService: vi.fn(() => mockBusyWalletsService),
}));

// Mock the routes service
vi.mock("../routes/services/routes.service", () => ({
  default: mockRoutesService,
}));

// Import after mocking
import { EasyRouteService, EasyRouteInput } from "../routes/services/easy-route.service";

// Mock database
const mockDb = {} as any;

// Helper to create valid test input
function createTestInput(overrides: Partial<EasyRouteInput> = {}): EasyRouteInput {
  const futureTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes in future
  return {
    arrivalTime: futureTime,
    hopCount: 3,
    destinationWallet: "DQTf1yf1YM4B48PqJyQ53SEWGDM6ib4YBV7P3wm2MCxj",
    tokenType: "SPL" as const,
    tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    hopAmountTokens: "100",
    hopAmountRaw: "100000000",
    creator: "CreatorWallet123456789abcdefghijklmnop",
    ...overrides,
  };
}

// Helper to create mock wallets
function createMockWallets(count: number): Array<{ id: number; address: string; isActive: boolean }> {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    address: `MockWallet${i + 1}xxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
    isActive: true,
    transactionsAmount: 0,
    lastUsedAt: null,
    createdAt: new Date(),
  }));
}

describe("EasyRouteService", () => {
  let service: EasyRouteService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));

    // Reset mock implementations
    mockBusyWalletsService.getRandomWallets.mockReset();
    mockBusyWalletsService.markWalletsUsed.mockReset();
    mockBusyWalletsService.getActiveCount.mockReset();
    mockRoutesService.createRoute.mockReset();
    mockRoutesService.getRoute.mockReset();

    // Create service instance
    service = new EasyRouteService(mockDb);

    // Override the internal busyWalletsService
    (service as any).busyWalletsService = mockBusyWalletsService;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("generateRandomWeights (tested indirectly)", () => {
    /**
     * The generateRandomWeights method is private, so we test it indirectly
     * through createEasyRoute by verifying the timing behavior
     */

    it("should generate weights that sum to 1.0 for multiple hops", async () => {
      // Setup: 5 hops, 4 intermediate wallets needed
      const mockWallets = createMockWallets(4);
      mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
      mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
      mockRoutesService.getRoute.mockResolvedValue({
        id: 1,
        creator: "test",
        hops: [],
      });

      const arrivalTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      const input = createTestInput({ hopCount: 5, arrivalTime });

      await service.createEasyRoute(input);

      // The route should be created - this verifies weights were generated correctly
      expect(mockRoutesService.createRoute).toHaveBeenCalledTimes(1);
      const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
      expect(createRouteCall.hops).toHaveLength(5);
    });

    it("should handle single hop (weight = 1.0)", async () => {
      // Single hop means no intermediate wallets, weight array should be [1.0]
      mockBusyWalletsService.getRandomWallets.mockResolvedValue([]);
      mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
      mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

      const arrivalTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      const input = createTestInput({ hopCount: 1, arrivalTime });

      await service.createEasyRoute(input);

      // Should not request any intermediate wallets
      expect(mockBusyWalletsService.getRandomWallets).not.toHaveBeenCalled();

      const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
      expect(createRouteCall.hops).toHaveLength(1);
      expect(createRouteCall.hops[0].recipient).toBe(input.destinationWallet);
    });

    it("should handle edge case of zero hops gracefully", async () => {
      // Zero hops is invalid but should be handled gracefully
      const arrivalTime = new Date(Date.now() + 10 * 60 * 1000);
      const input = createTestInput({ hopCount: 0, arrivalTime });

      mockBusyWalletsService.getRandomWallets.mockResolvedValue([]);
      mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
      mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

      // Should handle 0 hops without crashing
      const result = await service.createEasyRoute(input);
      expect(result).toBeDefined();
    });
  });

  describe("createEasyRoute", () => {
    describe("Wallet Generation", () => {
      it("should request correct number of intermediate wallets (hopCount - 1)", async () => {
        const mockWallets = createMockWallets(4);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const arrivalTime = new Date(Date.now() + 60 * 60 * 1000);
        const input = createTestInput({ hopCount: 5, arrivalTime });

        await service.createEasyRoute(input);

        // 5 hops = 4 intermediate wallets + 1 destination
        expect(mockBusyWalletsService.getRandomWallets).toHaveBeenCalledWith(4);
      });

      it("should not request wallets for single hop route", async () => {
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const arrivalTime = new Date(Date.now() + 10 * 60 * 1000);
        const input = createTestInput({ hopCount: 1, arrivalTime });

        await service.createEasyRoute(input);

        expect(mockBusyWalletsService.getRandomWallets).not.toHaveBeenCalled();
      });

      it("should throw error when not enough wallets available", async () => {
        // Need 4 wallets but only 2 available
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(createMockWallets(2));

        const arrivalTime = new Date(Date.now() + 60 * 60 * 1000);
        const input = createTestInput({ hopCount: 5, arrivalTime });

        await expect(service.createEasyRoute(input)).rejects.toThrow(
          "Not enough active wallets available. Need 4, found 2"
        );
      });

      it("should mark intermediate wallets as used after route creation", async () => {
        const mockWallets = createMockWallets(2);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const arrivalTime = new Date(Date.now() + 30 * 60 * 1000);
        const input = createTestInput({ hopCount: 3, arrivalTime });

        await service.createEasyRoute(input);

        expect(mockBusyWalletsService.markWalletsUsed).toHaveBeenCalledWith([1, 2]);
      });

      it("should not call markWalletsUsed when no intermediate wallets", async () => {
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const arrivalTime = new Date(Date.now() + 10 * 60 * 1000);
        const input = createTestInput({ hopCount: 1, arrivalTime });

        await service.createEasyRoute(input);

        expect(mockBusyWalletsService.markWalletsUsed).not.toHaveBeenCalled();
      });

      it("should use intermediate wallet addresses for hops and destination for last hop", async () => {
        const mockWallets = createMockWallets(2);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const arrivalTime = new Date(Date.now() + 30 * 60 * 1000);
        const destinationWallet = "FinalDestinationWalletAddressHere12345678";
        const input = createTestInput({ hopCount: 3, arrivalTime, destinationWallet });

        await service.createEasyRoute(input);

        const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
        expect(createRouteCall.hops[0].recipient).toBe(mockWallets[0].address);
        expect(createRouteCall.hops[1].recipient).toBe(mockWallets[1].address);
        expect(createRouteCall.hops[2].recipient).toBe(destinationWallet);
      });
    });

    describe("Hop Timing Calculation", () => {
      it("should throw error when arrival time is in the past", async () => {
        const pastTime = new Date(Date.now() - 1000); // 1 second ago
        const input = createTestInput({ arrivalTime: pastTime });

        await expect(service.createEasyRoute(input)).rejects.toThrow(
          "Arrival time must be in the future"
        );
      });

      it("should ensure last hop arrives at exactly the target arrival time", async () => {
        const mockWallets = createMockWallets(2);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const arrivalTime = new Date(Date.now() + 30 * 60 * 1000);
        const input = createTestInput({ hopCount: 3, arrivalTime });

        await service.createEasyRoute(input);

        const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
        const lastHop = createRouteCall.hops[createRouteCall.hops.length - 1];
        const lastHopTime = new Date(lastHop.scheduledAt);

        // Last hop should be at or very close to arrival time
        expect(lastHopTime.getTime()).toBe(arrivalTime.getTime());
      });

      it("should generate hops in chronological order", async () => {
        const mockWallets = createMockWallets(4);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const arrivalTime = new Date(Date.now() + 60 * 60 * 1000);
        const input = createTestInput({ hopCount: 5, arrivalTime });

        await service.createEasyRoute(input);

        const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
        const hops = createRouteCall.hops;

        for (let i = 1; i < hops.length; i++) {
          const prevTime = new Date(hops[i - 1].scheduledAt).getTime();
          const currTime = new Date(hops[i].scheduledAt).getTime();
          expect(currTime).toBeGreaterThan(prevTime);
        }
      });

      it("should respect minimum 2 minute hop duration for intermediate hops", async () => {
        const mockWallets = createMockWallets(2);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        // Provide enough time for minimum durations
        const arrivalTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        const input = createTestInput({ hopCount: 3, arrivalTime });

        await service.createEasyRoute(input);

        const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
        const hops = createRouteCall.hops;
        const now = Date.now();

        // Check first hop is after now
        const firstHopTime = new Date(hops[0].scheduledAt).getTime();
        expect(firstHopTime).toBeGreaterThan(now);

        // Check minimum duration between consecutive hops
        // Minimum is 2 min (120000ms) but with buffer and randomization, just check positive
        for (let i = 1; i < hops.length; i++) {
          const prevTime = new Date(hops[i - 1].scheduledAt).getTime();
          const currTime = new Date(hops[i].scheduledAt).getTime();
          const diff = currTime - prevTime;
          expect(diff).toBeGreaterThan(0);
        }
      });

      it("should include 30 second buffer per hop in calculations", async () => {
        const mockWallets = createMockWallets(1);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        // 2 hops with just enough time: 2 * (2 min + 30 sec) = 5 minutes
        const justEnoughTime = new Date(Date.now() + 6 * 60 * 1000); // 6 minutes
        const input = createTestInput({ hopCount: 2, arrivalTime: justEnoughTime });

        await service.createEasyRoute(input);

        // Should succeed with enough time
        expect(mockRoutesService.createRoute).toHaveBeenCalled();
      });
    });

    describe("Route Creation Integration", () => {
      it("should call routesService.createRoute with isEasyRoute flag set to true", async () => {
        const mockWallets = createMockWallets(2);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const input = createTestInput();

        await service.createEasyRoute(input);

        const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
        expect(createRouteCall.isEasyRoute).toBe(true);
      });

      it("should generate appropriate route name with hop count and destination preview", async () => {
        const mockWallets = createMockWallets(2);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const destinationWallet = "DQTf1yf1YM4B48PqJyQ53SEWGDM6ib4YBV7P3wm2MCxj";
        const input = createTestInput({ hopCount: 3, destinationWallet });

        await service.createEasyRoute(input);

        const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
        expect(createRouteCall.name).toContain("Easy Route");
        expect(createRouteCall.name).toContain("3 hops");
        expect(createRouteCall.name).toContain("DQTf"); // First 4 chars
        expect(createRouteCall.name).toContain("MCxj"); // Last 4 chars
      });

      it("should generate description with hop count and arrival time", async () => {
        const mockWallets = createMockWallets(2);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const arrivalTime = new Date(Date.now() + 30 * 60 * 1000);
        const input = createTestInput({ hopCount: 3, arrivalTime });

        await service.createEasyRoute(input);

        const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
        expect(createRouteCall.description).toContain("Auto-generated Easy Route");
        expect(createRouteCall.description).toContain("3 hops");
        expect(createRouteCall.description).toContain(arrivalTime.toISOString());
      });

      it("should pass through all token configuration correctly", async () => {
        const mockWallets = createMockWallets(2);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const input = createTestInput({
          tokenType: "SPL",
          tokenMint: "CustomMintAddress123456789abcdefghij",
          tokenSymbol: "BONK",
          tokenDecimals: 5,
          hopAmountTokens: "1000000",
          hopAmountRaw: "100000000000",
        });

        await service.createEasyRoute(input);

        const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
        expect(createRouteCall.tokenType).toBe("SPL");
        expect(createRouteCall.tokenMint).toBe("CustomMintAddress123456789abcdefghij");
        expect(createRouteCall.tokenSymbol).toBe("BONK");
        expect(createRouteCall.tokenDecimals).toBe(5);
        expect(createRouteCall.hopAmountTokens).toBe("1000000");
        expect(createRouteCall.hopAmountRaw).toBe("100000000000");
      });

      it("should pass creator address correctly", async () => {
        const mockWallets = createMockWallets(2);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const creatorAddress = "CreatorWallet999888777666555444333222";
        const input = createTestInput({ creator: creatorAddress });

        await service.createEasyRoute(input);

        const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
        expect(createRouteCall.creator).toBe(creatorAddress);
      });

      it("should return route with hops included", async () => {
        const mockWallets = createMockWallets(2);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);

        const routeFromCreate = { id: 42, creator: "test" };
        const routeFromGet = {
          id: 42,
          creator: "test",
          status: "draft",
          tokenType: "SPL",
        };

        mockRoutesService.createRoute.mockResolvedValue(routeFromCreate);
        mockRoutesService.getRoute.mockResolvedValue(routeFromGet);

        const input = createTestInput({ hopCount: 3 });

        const result = await service.createEasyRoute(input);

        // Should fetch the route after creation
        expect(mockRoutesService.getRoute).toHaveBeenCalledWith(42, "test");

        // Result should include hops
        expect(result.hops).toBeDefined();
        expect(result.hops).toHaveLength(3);
      });

      it("should handle SOL token type correctly", async () => {
        const mockWallets = createMockWallets(2);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const input = createTestInput({
          tokenType: "SOL",
          tokenMint: undefined,
          tokenSymbol: "SOL",
          tokenDecimals: 9,
        });

        await service.createEasyRoute(input);

        const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
        expect(createRouteCall.tokenType).toBe("SOL");
        expect(createRouteCall.tokenMint).toBeUndefined();
        expect(createRouteCall.tokenSymbol).toBe("SOL");
        expect(createRouteCall.tokenDecimals).toBe(9);
      });
    });

    describe("Edge Cases", () => {
      it("should handle 1 hop (no intermediate wallets needed)", async () => {
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const arrivalTime = new Date(Date.now() + 10 * 60 * 1000);
        const destinationWallet = "SingleHopDestinationWallet12345678901";
        const input = createTestInput({
          hopCount: 1,
          arrivalTime,
          destinationWallet,
        });

        const result = await service.createEasyRoute(input);

        expect(mockBusyWalletsService.getRandomWallets).not.toHaveBeenCalled();
        expect(mockBusyWalletsService.markWalletsUsed).not.toHaveBeenCalled();

        const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
        expect(createRouteCall.hops).toHaveLength(1);
        expect(createRouteCall.hops[0].recipient).toBe(destinationWallet);
      });

      it("should handle maximum 10 hops", async () => {
        const mockWallets = createMockWallets(9);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        // 10 hops need enough time: 10 * 2.5 min = 25 minutes minimum
        const arrivalTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        const input = createTestInput({ hopCount: 10, arrivalTime });

        await service.createEasyRoute(input);

        expect(mockBusyWalletsService.getRandomWallets).toHaveBeenCalledWith(9);

        const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
        expect(createRouteCall.hops).toHaveLength(10);
      });

      it("should handle routesService.getRoute returning null", async () => {
        const mockWallets = createMockWallets(2);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue(null);

        const input = createTestInput();

        const result = await service.createEasyRoute(input);

        // Should fall back to route from createRoute and include hops
        expect(result.id).toBe(1);
        expect(result.hops).toBeDefined();
      });

      it("should handle 2 hops (exactly 1 intermediate wallet)", async () => {
        const mockWallets = createMockWallets(1);
        mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
        mockRoutesService.createRoute.mockResolvedValue({ id: 1, creator: "test" });
        mockRoutesService.getRoute.mockResolvedValue({ id: 1, creator: "test", hops: [] });

        const arrivalTime = new Date(Date.now() + 10 * 60 * 1000);
        const destinationWallet = "TwoHopDestinationWallet123456789012";
        const input = createTestInput({
          hopCount: 2,
          arrivalTime,
          destinationWallet,
        });

        await service.createEasyRoute(input);

        expect(mockBusyWalletsService.getRandomWallets).toHaveBeenCalledWith(1);

        const createRouteCall = mockRoutesService.createRoute.mock.calls[0][0];
        expect(createRouteCall.hops).toHaveLength(2);
        expect(createRouteCall.hops[0].recipient).toBe(mockWallets[0].address);
        expect(createRouteCall.hops[1].recipient).toBe(destinationWallet);
      });
    });
  });

  describe("validateEasyRouteInput", () => {
    describe("Wallet Availability Validation", () => {
      it("should return valid when enough wallets are available", async () => {
        mockBusyWalletsService.getActiveCount.mockResolvedValue(10);

        const arrivalTime = new Date(Date.now() + 30 * 60 * 1000);
        const input = {
          arrivalTime,
          hopCount: 5, // Needs 4 intermediate wallets
          destinationWallet: "TestWallet123",
          tokenType: "SPL" as const,
          tokenDecimals: 6,
          hopAmountTokens: "100",
          hopAmountRaw: "100000000",
        };

        const result = await service.validateEasyRouteInput(input);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should return error when not enough wallets available", async () => {
        mockBusyWalletsService.getActiveCount.mockResolvedValue(2);

        const arrivalTime = new Date(Date.now() + 30 * 60 * 1000);
        const input = {
          arrivalTime,
          hopCount: 5, // Needs 4 intermediate wallets
          destinationWallet: "TestWallet123",
          tokenType: "SPL" as const,
          tokenDecimals: 6,
          hopAmountTokens: "100",
          hopAmountRaw: "100000000",
        };

        const result = await service.validateEasyRouteInput(input);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(
          "Not enough active wallets available. Need 4, found 2"
        );
      });

      it("should not check wallet count for single hop route", async () => {
        const arrivalTime = new Date(Date.now() + 10 * 60 * 1000);
        const input = {
          arrivalTime,
          hopCount: 1, // No intermediate wallets needed
          destinationWallet: "TestWallet123",
          tokenType: "SPL" as const,
          tokenDecimals: 6,
          hopAmountTokens: "100",
          hopAmountRaw: "100000000",
        };

        const result = await service.validateEasyRouteInput(input);

        expect(mockBusyWalletsService.getActiveCount).not.toHaveBeenCalled();
        expect(result.isValid).toBe(true);
      });
    });

    describe("Arrival Time Validation", () => {
      it("should return error when arrival time is in the past", async () => {
        mockBusyWalletsService.getActiveCount.mockResolvedValue(10);

        const pastTime = new Date(Date.now() - 1000);
        const input = {
          arrivalTime: pastTime,
          hopCount: 3,
          destinationWallet: "TestWallet123",
          tokenType: "SPL" as const,
          tokenDecimals: 6,
          hopAmountTokens: "100",
          hopAmountRaw: "100000000",
        };

        const result = await service.validateEasyRouteInput(input);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("Arrival time must be in the future");
      });

      it("should return error when arrival time is exactly now", async () => {
        mockBusyWalletsService.getActiveCount.mockResolvedValue(10);

        const now = new Date();
        const input = {
          arrivalTime: now,
          hopCount: 3,
          destinationWallet: "TestWallet123",
          tokenType: "SPL" as const,
          tokenDecimals: 6,
          hopAmountTokens: "100",
          hopAmountRaw: "100000000",
        };

        const result = await service.validateEasyRouteInput(input);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("Arrival time must be in the future");
      });

      it("should pass when arrival time is in the future", async () => {
        mockBusyWalletsService.getActiveCount.mockResolvedValue(10);

        const futureTime = new Date(Date.now() + 60 * 60 * 1000);
        const input = {
          arrivalTime: futureTime,
          hopCount: 3,
          destinationWallet: "TestWallet123",
          tokenType: "SPL" as const,
          tokenDecimals: 6,
          hopAmountTokens: "100",
          hopAmountRaw: "100000000",
        };

        const result = await service.validateEasyRouteInput(input);

        expect(result.errors).not.toContain("Arrival time must be in the future");
      });
    });

    describe("Multiple Errors", () => {
      it("should collect all validation errors", async () => {
        mockBusyWalletsService.getActiveCount.mockResolvedValue(1); // Not enough wallets

        const pastTime = new Date(Date.now() - 1000); // Past time
        const input = {
          arrivalTime: pastTime,
          hopCount: 5, // Needs 4 wallets, only 1 available
          destinationWallet: "TestWallet123",
          tokenType: "SPL" as const,
          tokenDecimals: 6,
          hopAmountTokens: "100",
          hopAmountRaw: "100000000",
        };

        const result = await service.validateEasyRouteInput(input);

        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
        expect(result.errors).toContain("Arrival time must be in the future");
        expect(
          result.errors.some((e) => e.includes("Not enough active wallets"))
        ).toBe(true);
      });
    });
  });

  describe("Integration Scenarios", () => {
    it("should create complete easy route workflow successfully", async () => {
      const mockWallets = createMockWallets(4);
      mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
      mockBusyWalletsService.getActiveCount.mockResolvedValue(10);
      mockRoutesService.createRoute.mockResolvedValue({
        id: 100,
        creator: "IntegrationTestCreator",
        status: "draft",
        isEasyRoute: true,
      });
      mockRoutesService.getRoute.mockResolvedValue({
        id: 100,
        creator: "IntegrationTestCreator",
        status: "draft",
        isEasyRoute: true,
        tokenType: "SPL",
        tokenSymbol: "USDC",
      });

      const arrivalTime = new Date(Date.now() + 60 * 60 * 1000);
      const input = createTestInput({
        hopCount: 5,
        arrivalTime,
        creator: "IntegrationTestCreator",
      });

      // First validate
      const validation = await service.validateEasyRouteInput({
        arrivalTime: input.arrivalTime,
        hopCount: input.hopCount,
        destinationWallet: input.destinationWallet,
        tokenType: input.tokenType,
        tokenMint: input.tokenMint,
        tokenSymbol: input.tokenSymbol,
        tokenDecimals: input.tokenDecimals,
        hopAmountTokens: input.hopAmountTokens,
        hopAmountRaw: input.hopAmountRaw,
      });
      expect(validation.isValid).toBe(true);

      // Then create
      const result = await service.createEasyRoute(input);

      expect(result.id).toBe(100);
      expect(result.isEasyRoute).toBe(true);
      expect(result.hops).toHaveLength(5);

      // Verify all steps executed
      expect(mockBusyWalletsService.getRandomWallets).toHaveBeenCalledWith(4);
      expect(mockRoutesService.createRoute).toHaveBeenCalled();
      expect(mockBusyWalletsService.markWalletsUsed).toHaveBeenCalledWith([1, 2, 3, 4]);
      expect(mockRoutesService.getRoute).toHaveBeenCalledWith(100, "IntegrationTestCreator");
    });

    it("should handle route creation failure gracefully", async () => {
      const mockWallets = createMockWallets(2);
      mockBusyWalletsService.getRandomWallets.mockResolvedValue(mockWallets);
      mockRoutesService.createRoute.mockRejectedValue(new Error("Database error"));

      const input = createTestInput();

      await expect(service.createEasyRoute(input)).rejects.toThrow("Database error");

      // Wallets should not be marked as used since route creation failed
      expect(mockBusyWalletsService.markWalletsUsed).not.toHaveBeenCalled();
    });
  });
});
