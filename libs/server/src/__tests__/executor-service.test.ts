import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

vi.hoisted(() => {
  process.env.SOLANA_RPC_URL = "http://localhost:8899";
});

// Hoisted mocks
const { mockGetBalance, mockSendAndConfirmTransaction } = vi.hoisted(() => ({
  mockGetBalance: vi.fn(),
  mockSendAndConfirmTransaction: vi.fn(),
}));

// Mock @solana/web3.js Connection
vi.mock("@solana/web3.js", async () => {
  const actual = await vi.importActual("@solana/web3.js");

  class MockConnection {
    constructor() {}
    getBalance = mockGetBalance;
  }

  return {
    ...actual,
    Connection: MockConnection,
    sendAndConfirmTransaction: mockSendAndConfirmTransaction,
  };
});

// Mock logger
vi.mock("@libs/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Set SIGNER_PRIVATE_KEY for getSigner tests (matches e2e_test_executor_seed deterministic derivation)
process.env.SIGNER_PRIVATE_KEY =
  "13XR3o3HYSYx1RGVMTGHD3dFRFWmEPMX8mCLgNawDhJmMUQdr66Y6gagzYZ2A9zPy5uAhfJY9vrjw9eZSZ25F1J";

import executorService from "../executors/executor.service";

describe("executorService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getWalletByRouteId", () => {
    it("should return a deterministic Keypair for a given routeId", () => {
      const wallet1 = executorService.getWalletByRouteId(1);
      const wallet2 = executorService.getWalletByRouteId(1);
      expect(wallet1.publicKey.toBase58()).toBe(wallet2.publicKey.toBase58());
    });

    it("should return different keypairs for different routeIds", () => {
      const wallet1 = executorService.getWalletByRouteId(1);
      const wallet2 = executorService.getWalletByRouteId(2);
      expect(wallet1.publicKey.toBase58()).not.toBe(
        wallet2.publicKey.toBase58()
      );
    });

    it("should return a valid Solana Keypair", () => {
      const wallet = executorService.getWalletByRouteId(42);
      expect(wallet).toBeInstanceOf(Keypair);
      expect(wallet.publicKey).toBeInstanceOf(PublicKey);
    });
  });

  describe("getExecutorPublicKey", () => {
    it("should return a base58 string", () => {
      const pubkey = executorService.getExecutorPublicKey(1);
      expect(typeof pubkey).toBe("string");
      // Solana public keys are 32-44 chars base58
      expect(pubkey.length).toBeGreaterThanOrEqual(32);
      expect(pubkey.length).toBeLessThanOrEqual(44);
    });

    it("should match the public key from getWalletByRouteId", () => {
      const wallet = executorService.getWalletByRouteId(5);
      const pubkey = executorService.getExecutorPublicKey(5);
      expect(pubkey).toBe(wallet.publicKey.toBase58());
    });
  });

  describe("balance", () => {
    it("should return balance as BN", async () => {
      mockGetBalance.mockResolvedValue(1000000);
      const result = await executorService.balance(1);
      expect(result).toBeInstanceOf(BN);
      expect(result.toNumber()).toBe(1000000);
    });

    it("should propagate errors", async () => {
      mockGetBalance.mockRejectedValue(new Error("RPC error"));
      await expect(executorService.balance(1)).rejects.toThrow("RPC error");
    });
  });

  describe("withdrawOnBehalf", () => {
    it("should send a transfer transaction", async () => {
      mockGetBalance.mockResolvedValue(2000000);
      mockSendAndConfirmTransaction.mockResolvedValue("txSig123");

      const result = await executorService.withdrawOnBehalf(
        1,
        "11111111111111111111111111111111",
        new BN(1000000)
      );
      expect(result).toBe("txSig123");
      expect(mockSendAndConfirmTransaction).toHaveBeenCalled();
    });

    it("should throw when balance is insufficient", async () => {
      mockGetBalance.mockResolvedValue(500);

      await expect(
        executorService.withdrawOnBehalf(
          1,
          "11111111111111111111111111111111",
          new BN(1000000)
        )
      ).rejects.toThrow("Insufficient balance");
    });
  });

  describe("getSigner", () => {
    it("should return a deterministic signer keypair", () => {
      const signer1 = executorService.getSigner();
      const signer2 = executorService.getSigner();
      expect(signer1.publicKey.toBase58()).toBe(signer2.publicKey.toBase58());
    });

    it("should return a different keypair than route wallets", () => {
      const signer = executorService.getSigner();
      const routeWallet = executorService.getWalletByRouteId(1);
      expect(signer.publicKey.toBase58()).not.toBe(
        routeWallet.publicKey.toBase58()
      );
    });
  });

  describe("getKeypair (deprecated)", () => {
    it("should return the same keypair as getWalletByRouteId", async () => {
      const wallet = executorService.getWalletByRouteId(10);
      const keypair = await executorService.getKeypair(10);
      expect(keypair.publicKey.toBase58()).toBe(wallet.publicKey.toBase58());
    });
  });
});
