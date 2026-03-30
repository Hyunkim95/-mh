import { describe, it, expect, vi, beforeEach } from "vitest";
import { WalletManager } from "../wallet-manager";
import type { CustodialWallet } from "../schema";

// Concrete test implementation of the abstract WalletManager
class TestWalletManager extends WalletManager {
  public wallets = new Map<string, CustodialWallet>();

  async generateWallet() {
    return {
      address: "test-address-" + Math.random().toString(36).slice(2),
      privateKey: "test-private-key-" + Math.random().toString(36).slice(2),
    };
  }

  validateAddress(address: string) {
    return address.startsWith("test-address-");
  }

  async getWalletByIdentifier(identifier: string) {
    return this.wallets.get(identifier) ?? null;
  }

  async createWallet(
    identifier: string,
    address: string,
    encryptedPrivateKey: string,
    iv: string
  ): Promise<CustodialWallet> {
    const wallet: CustodialWallet = {
      id: this.wallets.size + 1,
      keyIdentifier: identifier,
      address,
      encryptedPrivateKey,
      iv,
      chainType: "solana",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.wallets.set(identifier, wallet);
    return wallet;
  }

  async updateWallet(
    id: string,
    updates: Partial<CustodialWallet>
  ): Promise<CustodialWallet> {
    for (const [, wallet] of this.wallets) {
      if (wallet.id === Number(id)) {
        Object.assign(wallet, updates);
        return wallet;
      }
    }
    throw new Error("Wallet not found");
  }
}

describe("WalletManager", () => {
  let manager: TestWalletManager;

  beforeEach(() => {
    manager = new TestWalletManager({ encryptionKey: "test-encryption-key" });
  });

  describe("getOrCreateWallet", () => {
    it("creates a new wallet when none exists", async () => {
      const wallet = await manager.getOrCreateWallet("user-1");
      expect(wallet.keyIdentifier).toBe("user-1");
      expect(wallet.address).toBeTruthy();
      expect(wallet.encryptedPrivateKey).toBeTruthy();
      expect(wallet.iv).toBeTruthy();
    });

    it("returns existing wallet on second call", async () => {
      const first = await manager.getOrCreateWallet("user-1");
      const second = await manager.getOrCreateWallet("user-1");
      expect(first.id).toBe(second.id);
      expect(first.address).toBe(second.address);
    });

    it("creates different wallets for different identifiers", async () => {
      const a = await manager.getOrCreateWallet("user-a");
      const b = await manager.getOrCreateWallet("user-b");
      expect(a.address).not.toBe(b.address);
    });
  });

  describe("getDecryptedPrivateKey", () => {
    it("decrypts the private key of a created wallet", async () => {
      const wallet = await manager.getOrCreateWallet("user-decrypt");
      const decrypted = await manager.getDecryptedPrivateKey(wallet);
      // The decrypted value should be a string (the original private key)
      expect(typeof decrypted).toBe("string");
      expect(decrypted.length).toBeGreaterThan(0);
    });
  });
});
