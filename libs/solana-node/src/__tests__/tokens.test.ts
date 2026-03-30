import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccount: vi.fn(),
  getAssociatedTokenAddress: vi.fn(),
}));

vi.mock("@solana/web3.js", () => ({
  PublicKey: class MockPublicKey {
    _key: string;
    constructor(key: string) { this._key = key; }
    toString() { return this._key; }
  },
  Connection: class {},
}));

vi.mock("@solana/spl-token", () => ({
  getAccount: mocks.getAccount,
  getAssociatedTokenAddress: mocks.getAssociatedTokenAddress,
}));

// Mock the re-exports to prevent loading metaplex deps
vi.mock("../token-metadata", () => ({
  fetchTokenMetadata: vi.fn(),
  fetchTokenInfo: vi.fn(),
  fetchOnChainMetadata: vi.fn(),
  hasTokenMetadata: vi.fn(),
  batchFetchTokenMetadata: vi.fn(),
  batchFetchTokenInfo: vi.fn(),
}));

import { getTokenBalance, getAssociatedTokenAccount } from "../tokens";

describe("tokens", () => {
  describe("getTokenBalance", () => {
    it("returns the token balance", async () => {
      mocks.getAccount.mockResolvedValue({ amount: BigInt(1_000_000) });

      const result = await getTokenBalance({} as any, { _key: "ata" } as any);

      expect(result).toBe(BigInt(1_000_000));
    });
  });

  describe("getAssociatedTokenAccount", () => {
    it("returns the ATA address", async () => {
      mocks.getAssociatedTokenAddress.mockResolvedValue({ _key: "ata-addr" });

      const result = await getAssociatedTokenAccount(
        { _key: "mint" } as any,
        { _key: "owner" } as any
      );

      expect(result).toEqual({ _key: "ata-addr" });
    });

    it("passes allowOwnerOffCurve", async () => {
      mocks.getAssociatedTokenAddress.mockResolvedValue({ _key: "ata" });

      await getAssociatedTokenAccount(
        { _key: "mint" } as any,
        { _key: "owner" } as any,
        true
      );

      expect(mocks.getAssociatedTokenAddress).toHaveBeenCalledWith(
        { _key: "mint" },
        { _key: "owner" },
        true
      );
    });
  });
});
