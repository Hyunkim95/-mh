import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const { mockAxiosPost } = vi.hoisted(() => {
  process.env.HELIUS_API = "https://helius.test";

  return {
    mockAxiosPost: vi.fn(),
  };
});

const localValidatorMocks = vi.hoisted(() => ({
  getParsedTokenAccountsByOwner: vi.fn(),
  fetchTokenMetadata: vi.fn(),
}));

// Mock axios
vi.mock("axios", () => ({
  default: {
    post: mockAxiosPost,
  },
}));

// Mock lodash get
vi.mock("lodash", () => ({
  get: (obj: any, path: string) => {
    return path.split(".").reduce((acc, key) => acc?.[key], obj);
  },
}));

// Mock logger
vi.mock("@libs/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@solana/web3.js", () => ({
  Connection: class MockConnection {
    getParsedTokenAccountsByOwner = localValidatorMocks.getParsedTokenAccountsByOwner;
  },
  PublicKey: class MockPublicKey {
    constructor(public value: string) {}
    toBase58() {
      return this.value;
    }
  },
}));

vi.mock("@solana/spl-token", () => ({
  TOKEN_PROGRAM_ID: "token-program",
  TOKEN_2022_PROGRAM_ID: "token-2022-program",
}));

vi.mock("@libs/solana-node", () => ({
  fetchTokenMetadata: localValidatorMocks.fetchTokenMetadata,
}));

import {
  tokensService,
  getTokenPrice,
  crossSectionWithTokenConfigs,
} from "../solana/services/tokens.service";

describe("tokensService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
    // Invalidate caches between tests
    tokensService.invalidateCache("testOwner");
    tokensService.invalidateCache("localOwner");
    tokensService.invalidateCache("localCrossOwner");
  });

  describe("getTokensAccountsWithCache", () => {
    it("should fetch tokens from Helius API", async () => {
      const mockTokens = [
        { interface: "FungibleToken", id: "token1" },
        { interface: "FungibleToken", id: "token2" },
        { interface: "ProgrammableNFT", id: "nft1" }, // should be filtered
      ];
      mockAxiosPost.mockResolvedValue({
        data: {
          result: {
            total: 3,
            items: mockTokens,
          },
        },
      });

      const result = await tokensService.getTokensAccountsWithCache(
        "testOwner",
        "https://test-api.com"
      );
      // Should filter to only FungibleToken
      expect(result).toHaveLength(2);
      expect(result.every((t: any) => t.interface === "FungibleToken")).toBe(true);
    });

    it("should return cached results on second call", async () => {
      const mockTokens = [
        { interface: "FungibleToken", id: "token1" },
      ];
      mockAxiosPost.mockResolvedValue({
        data: {
          result: {
            total: 1,
            items: mockTokens,
          },
        },
      });

      // First call
      await tokensService.getTokensAccountsWithCache(
        "cacheOwner",
        "https://test-api.com"
      );
      // Second call should use cache
      const result = await tokensService.getTokensAccountsWithCache(
        "cacheOwner",
        "https://test-api.com"
      );

      expect(result).toHaveLength(1);
      // Only one API call since second was cached
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);

      // Clean up
      tokensService.invalidateCache("cacheOwner");
    });

    it("should paginate through multiple pages", async () => {
      // First page
      mockAxiosPost
        .mockResolvedValueOnce({
          data: {
            result: {
              total: 3,
              items: [
                { interface: "FungibleToken", id: "token1" },
                { interface: "FungibleToken", id: "token2" },
              ],
            },
          },
        })
        // Second page
        .mockResolvedValueOnce({
          data: {
            result: {
              total: 3,
              items: [{ interface: "FungibleToken", id: "token3" }],
            },
          },
        });

      const result = await tokensService.getTokensAccountsWithCache(
        "paginationOwner",
        "https://test-api.com"
      );
      expect(result).toHaveLength(3);
      expect(mockAxiosPost).toHaveBeenCalledTimes(2);

      tokensService.invalidateCache("paginationOwner");
    });
  });

  describe("invalidateCache", () => {
    it("should clear cached data for owner", async () => {
      const mockTokens = [{ interface: "FungibleToken", id: "token1" }];
      mockAxiosPost.mockResolvedValue({
        data: {
          result: { total: 1, items: mockTokens },
        },
      });

      await tokensService.getTokensAccountsWithCache(
        "invalidateOwner",
        "https://test-api.com"
      );
      tokensService.invalidateCache("invalidateOwner");

      // After invalidation, should fetch from API again
      await tokensService.getTokensAccountsWithCache(
        "invalidateOwner",
        "https://test-api.com"
      );
      expect(mockAxiosPost).toHaveBeenCalledTimes(2);

      tokensService.invalidateCache("invalidateOwner");
    });
  });

  describe("crossSectionWithTokenConfigs", () => {
    it("should return tokens and empty tokenConfigs", async () => {
      const mockTokens = [{ interface: "FungibleToken", id: "token1" }];
      mockAxiosPost.mockResolvedValue({
        data: {
          result: { total: 1, items: mockTokens },
        },
      });

      const result = await crossSectionWithTokenConfigs(
        "crossOwner",
        "https://test-api.com"
      );
      expect(result.tokens).toHaveLength(1);
      expect(result.tokenConfigs).toEqual([]);

      tokensService.invalidateCache("crossOwner");
    });

    it("should return empty arrays when no tokens found", async () => {
      mockAxiosPost.mockResolvedValue({
        data: {
          result: { total: 0, items: [] },
        },
      });

      const result = await crossSectionWithTokenConfigs(
        "emptyOwner",
        "https://test-api.com"
      );
      expect(result.tokens).toEqual([]);
      expect(result.tokenConfigs).toEqual([]);

      tokensService.invalidateCache("emptyOwner");
    });
  });

  describe("local validator fallback", () => {
    it("returns locally minted SPL tokens from RPC instead of Helius", async () => {
      process.env.SOLANA_RPC_URL = "http://localhost:8899";
      localValidatorMocks.getParsedTokenAccountsByOwner
        .mockResolvedValueOnce({
          value: [
            {
              account: {
                data: {
                  parsed: {
                    info: {
                      mint: "mint-one",
                      tokenAmount: {
                        amount: "1500000",
                        decimals: 6,
                      },
                    },
                  },
                },
              },
            },
          ],
        })
        .mockResolvedValueOnce({ value: [] });
      localValidatorMocks.fetchTokenMetadata.mockResolvedValue({
        name: "Local Token",
        symbol: "LOCAL",
        uri: "https://example.com/meta.json",
        image: "https://example.com/token.png",
      });

      const result = await tokensService.getTokensAccountsWithCache("localOwner");

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        interface: "FungibleToken",
        id: "mint-one",
        token_info: {
          balance: "1500000",
          decimals: 6,
        },
      });
      expect(result[0].content.metadata?.name).toBe("Local Token");
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it("crossSection uses local validator assets when running locally", async () => {
      process.env.SOLANA_RPC_URL = "http://localhost:8899";
      localValidatorMocks.getParsedTokenAccountsByOwner
        .mockResolvedValueOnce({
          value: [
            {
              account: {
                data: {
                  parsed: {
                    info: {
                      mint: "mint-two",
                      tokenAmount: {
                        amount: "42",
                        decimals: 0,
                      },
                    },
                  },
                },
              },
            },
          ],
        })
        .mockResolvedValueOnce({ value: [] });
      localValidatorMocks.fetchTokenMetadata.mockResolvedValue(null);

      const result = await crossSectionWithTokenConfigs("localCrossOwner");

      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].id).toBe("mint-two");
      expect(result.tokenConfigs).toEqual([]);
    });
  });

  describe("getTokenPrice", () => {
    it("should return price from price_per_token field", async () => {
      mockAxiosPost.mockResolvedValue({
        data: {
          result: {
            token_info: {
              price_per_token: 1.5,
            },
          },
        },
      });

      const result = await getTokenPrice("mintAddr", "https://test-api.com");
      expect(result.price).toBe(1.5);
      expect(result.pricePerToken).toBe(1.5);
    });

    it("should return price from price_info.price_per_token", async () => {
      mockAxiosPost.mockResolvedValue({
        data: {
          result: {
            token_info: {
              price_per_token: 0, // falsy, so should fall through
              price_info: {
                price_per_token: 2.5,
                total_price: 10.0,
              },
            },
          },
        },
      });

      const result = await getTokenPrice("mintAddr2", "https://test-api.com");
      expect(result.pricePerToken).toBe(2.5);
    });

    it("should calculate price from total_price / balance", async () => {
      mockAxiosPost.mockResolvedValue({
        data: {
          result: {
            token_info: {
              price_info: {
                total_price: 100.0,
              },
              balance: 50,
            },
          },
        },
      });

      const result = await getTokenPrice("mintAddr3", "https://test-api.com");
      expect(result.pricePerToken).toBe(2.0);
    });

    it("should return null when no price available", async () => {
      mockAxiosPost.mockResolvedValue({
        data: {
          result: {
            token_info: {},
          },
        },
      });

      const result = await getTokenPrice("mintNoPrice", "https://test-api.com");
      expect(result.price).toBeNull();
      expect(result.pricePerToken).toBeNull();
    });

    it("should return null on error", async () => {
      mockAxiosPost.mockRejectedValue(new Error("API error"));

      const result = await getTokenPrice("mintError", "https://test-api.com");
      expect(result.price).toBeNull();
      expect(result.pricePerToken).toBeNull();
    });

    it("should use cached price within TTL", async () => {
      mockAxiosPost.mockResolvedValue({
        data: {
          result: {
            token_info: {
              price_per_token: 3.0,
            },
          },
        },
      });

      // First call fetches from API
      await getTokenPrice("cachedMint", "https://test-api.com");
      // Second call should use cache
      const result = await getTokenPrice("cachedMint", "https://test-api.com");

      expect(result.price).toBe(3.0);
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });
  });
});
