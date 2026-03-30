import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createUmi: vi.fn(),
  fromWeb3JsPublicKey: vi.fn((pk: any) => pk),
  toWeb3JsPublicKey: vi.fn((pk: any) => pk),
  fetchDigitalAsset: vi.fn(),
  fetchMetadata: vi.fn(),
  findMetadataPda: vi.fn(),
}));

vi.mock("@solana/web3.js", () => ({
  PublicKey: class MockPublicKey {
    _key: string;
    constructor(key: string) { this._key = key; }
    toString() { return this._key; }
    toBase58() { return this._key; }
  },
  Connection: class MockConnection {
    rpcEndpoint = "https://api.devnet.solana.com";
    getParsedAccountInfo = vi.fn();
  },
}));

vi.mock("@metaplex-foundation/umi-bundle-defaults", () => ({
  createUmi: mocks.createUmi,
}));

vi.mock("@metaplex-foundation/umi-web3js-adapters", () => ({
  fromWeb3JsPublicKey: mocks.fromWeb3JsPublicKey,
  toWeb3JsPublicKey: mocks.toWeb3JsPublicKey,
}));

vi.mock("@metaplex-foundation/mpl-token-metadata", () => ({
  fetchDigitalAsset: mocks.fetchDigitalAsset,
  fetchMetadata: mocks.fetchMetadata,
  findMetadataPda: mocks.findMetadataPda,
}));

vi.mock("@libs/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  fetchTokenMetadata,
  fetchTokenInfo,
  fetchOnChainMetadata,
  hasTokenMetadata,
  fetchTokenMetadataURI,
  batchFetchTokenMetadata,
  batchFetchTokenInfo,
} from "../token-metadata";
import { Connection, PublicKey } from "@solana/web3.js";

describe("token-metadata", () => {
  let mockConnection: Connection;
  const mockUmi = {
    rpc: { getAccount: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnection = new Connection("https://api.devnet.solana.com") as any;
    mocks.createUmi.mockReturnValue(mockUmi);
    mocks.toWeb3JsPublicKey.mockReturnValue({
      toBase58: () => "update-authority-key",
    });
    mocks.findMetadataPda.mockReturnValue([{ _key: "metadata-pda" }]);
  });

  describe("fetchTokenMetadata", () => {
    const baseMetadata = {
      name: "TestToken",
      symbol: "TT",
      uri: "https://example.com/token.json",
      updateAuthority: "update-auth",
      isMutable: true,
      primarySaleHappened: false,
      sellerFeeBasisPoints: 500,
      tokenStandard: { toString: () => "NonFungible" },
      collection: { __option: "None" },
      uses: { __option: "None" },
    };

    it("returns metadata for a valid mint (string)", async () => {
      mocks.fetchDigitalAsset.mockResolvedValue({ metadata: baseMetadata });

      const result = await fetchTokenMetadata(mockConnection, "mint-address");

      expect(result).toBeDefined();
      expect(result!.name).toBe("TestToken");
      expect(result!.symbol).toBe("TT");
      expect(result!.uri).toBe("https://example.com/token.json");
      expect(result!.isMutable).toBe(true);
      expect(result!.sellerFeeBasisPoints).toBe(500);
    });

    it("returns metadata for a PublicKey input", async () => {
      mocks.fetchDigitalAsset.mockResolvedValue({ metadata: baseMetadata });
      const pk = new PublicKey("mint-pk");

      const result = await fetchTokenMetadata(mockConnection, pk);

      expect(result).toBeDefined();
      expect(result!.mint).toBe("mint-pk");
    });

    it("returns null when no metadata exists", async () => {
      mocks.fetchDigitalAsset.mockResolvedValue({ metadata: null });

      const result = await fetchTokenMetadata(mockConnection, "no-metadata");

      expect(result).toBeNull();
    });

    it("returns null on error", async () => {
      mocks.fetchDigitalAsset.mockRejectedValue(new Error("Network error"));

      const result = await fetchTokenMetadata(mockConnection, "bad-mint");

      expect(result).toBeNull();
    });

    it("includes collection info when present", async () => {
      const metadataWithCollection = {
        ...baseMetadata,
        collection: {
          __option: "Some",
          value: {
            verified: true,
            key: "collection-key",
          },
        },
      };
      mocks.fetchDigitalAsset.mockResolvedValue({ metadata: metadataWithCollection });

      const result = await fetchTokenMetadata(mockConnection, "mint-with-collection");

      expect(result!.collection).toBeDefined();
      expect(result!.collection!.verified).toBe(true);
    });

    it("includes uses info when present", async () => {
      const metadataWithUses = {
        ...baseMetadata,
        uses: {
          __option: "Some",
          value: {
            useMethod: { toString: () => "Burn" },
            remaining: 5,
            total: 10,
          },
        },
      };
      mocks.fetchDigitalAsset.mockResolvedValue({ metadata: metadataWithUses });

      const result = await fetchTokenMetadata(mockConnection, "mint-with-uses");

      expect(result!.uses).toBeDefined();
      expect(result!.uses!.useMethod).toBe("Burn");
      expect(result!.uses!.remaining).toBe(5);
      expect(result!.uses!.total).toBe(10);
    });
  });

  describe("fetchTokenInfo", () => {
    it("returns token info with decimals and supply", async () => {
      (mockConnection as any).getParsedAccountInfo = vi.fn().mockResolvedValue({
        value: {
          data: {
            parsed: {
              info: { decimals: 9, supply: "1000000000" },
            },
          },
        },
      });
      mocks.fetchDigitalAsset.mockResolvedValue({
        metadata: {
          name: "Token",
          symbol: "TK",
          uri: "",
          updateAuthority: "ua",
          isMutable: true,
          primarySaleHappened: false,
          sellerFeeBasisPoints: 0,
          tokenStandard: null,
          collection: { __option: "None" },
          uses: { __option: "None" },
        },
      });

      const result = await fetchTokenInfo(mockConnection, "mint-addr");

      expect(result).toBeDefined();
      expect(result!.decimals).toBe(9);
      expect(result!.supply).toBe("1000000000");
      expect(result!.name).toBe("Token");
    });

    it("handles non-parsed account data", async () => {
      (mockConnection as any).getParsedAccountInfo = vi.fn().mockResolvedValue({
        value: { data: Buffer.from("raw-data") },
      });
      mocks.fetchDigitalAsset.mockResolvedValue({
        metadata: {
          name: "Token",
          symbol: "TK",
          uri: "",
          updateAuthority: "ua",
          isMutable: true,
          primarySaleHappened: false,
          sellerFeeBasisPoints: 0,
          tokenStandard: null,
          collection: { __option: "None" },
          uses: { __option: "None" },
        },
      });

      const result = await fetchTokenInfo(mockConnection, "mint");

      expect(result).toBeDefined();
      expect(result!.decimals).toBeUndefined();
    });

    it("returns null on error", async () => {
      (mockConnection as any).getParsedAccountInfo = vi.fn().mockRejectedValue(
        new Error("fail")
      );

      const result = await fetchTokenInfo(mockConnection, "bad");

      expect(result).toBeNull();
    });
  });

  describe("fetchOnChainMetadata", () => {
    it("returns on-chain metadata", async () => {
      mocks.fetchMetadata.mockResolvedValue({
        name: "OnChain",
        symbol: "OC",
        uri: "https://example.com/meta.json",
        updateAuthority: "ua",
        isMutable: false,
        primarySaleHappened: true,
        sellerFeeBasisPoints: 250,
        tokenStandard: { toString: () => "Fungible" },
      });

      const result = await fetchOnChainMetadata(mockConnection, "mint");

      expect(result).toBeDefined();
      expect(result!.name).toBe("OnChain");
      expect(result!.symbol).toBe("OC");
      expect(result!.tokenStandard).toBe("Fungible");
    });

    it("handles empty uri", async () => {
      mocks.fetchMetadata.mockResolvedValue({
        name: "NoURI",
        symbol: "NU",
        uri: "",
        updateAuthority: "ua",
        isMutable: true,
        primarySaleHappened: false,
        sellerFeeBasisPoints: 0,
        tokenStandard: null,
      });

      const result = await fetchOnChainMetadata(mockConnection, "mint");

      expect(result!.uri).toBeUndefined();
    });

    it("returns null on error", async () => {
      mocks.fetchMetadata.mockRejectedValue(new Error("fail"));

      const result = await fetchOnChainMetadata(mockConnection, "bad");

      expect(result).toBeNull();
    });
  });

  describe("hasTokenMetadata", () => {
    it("returns true when metadata exists", async () => {
      mockUmi.rpc.getAccount.mockResolvedValue({ exists: true });

      const result = await hasTokenMetadata(mockConnection, "mint");

      expect(result).toBe(true);
    });

    it("returns false when metadata does not exist", async () => {
      mockUmi.rpc.getAccount.mockResolvedValue({ exists: false });

      const result = await hasTokenMetadata(mockConnection, "no-meta");

      expect(result).toBe(false);
    });

    it("returns false on error", async () => {
      mockUmi.rpc.getAccount.mockRejectedValue(new Error("fail"));

      const result = await hasTokenMetadata(mockConnection, "error");

      expect(result).toBe(false);
    });
  });

  describe("fetchTokenMetadataURI", () => {
    it("returns URI when present and non-empty", async () => {
      mocks.fetchMetadata.mockResolvedValue({
        uri: "https://example.com/token.json",
      });

      const result = await fetchTokenMetadataURI(mockConnection, "mint");

      expect(result).toBe("https://example.com/token.json");
    });

    it("returns null when URI is empty", async () => {
      mocks.fetchMetadata.mockResolvedValue({ uri: "" });

      const result = await fetchTokenMetadataURI(mockConnection, "mint");

      expect(result).toBeNull();
    });

    it("returns null when URI is whitespace only", async () => {
      mocks.fetchMetadata.mockResolvedValue({ uri: "   " });

      const result = await fetchTokenMetadataURI(mockConnection, "mint");

      expect(result).toBeNull();
    });

    it("returns null on error", async () => {
      mocks.fetchMetadata.mockRejectedValue(new Error("fail"));

      const result = await fetchTokenMetadataURI(mockConnection, "bad");

      expect(result).toBeNull();
    });
  });

  describe("batchFetchTokenMetadata", () => {
    it("fetches metadata for multiple mints", async () => {
      mocks.fetchDigitalAsset
        .mockResolvedValueOnce({
          metadata: {
            name: "Token1",
            symbol: "T1",
            uri: "",
            updateAuthority: "ua",
            isMutable: true,
            primarySaleHappened: false,
            sellerFeeBasisPoints: 0,
            tokenStandard: null,
            collection: { __option: "None" },
            uses: { __option: "None" },
          },
        })
        .mockResolvedValueOnce({ metadata: null });

      const results = await batchFetchTokenMetadata(mockConnection, [
        "mint1",
        "mint2",
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]!.name).toBe("Token1");
      expect(results[1]).toBeNull();
    });

    it("returns empty array for empty input", async () => {
      const results = await batchFetchTokenMetadata(mockConnection, []);

      expect(results).toHaveLength(0);
    });
  });

  describe("batchFetchTokenInfo", () => {
    it("fetches info for multiple mints", async () => {
      (mockConnection as any).getParsedAccountInfo = vi.fn().mockResolvedValue({
        value: {
          data: {
            parsed: { info: { decimals: 6, supply: "100" } },
          },
        },
      });
      mocks.fetchDigitalAsset.mockResolvedValue({
        metadata: {
          name: "Tok",
          symbol: "T",
          uri: "",
          updateAuthority: "ua",
          isMutable: true,
          primarySaleHappened: false,
          sellerFeeBasisPoints: 0,
          tokenStandard: null,
          collection: { __option: "None" },
          uses: { __option: "None" },
        },
      });

      const results = await batchFetchTokenInfo(mockConnection, ["m1", "m2"]);

      expect(results).toHaveLength(2);
    });
  });
});
