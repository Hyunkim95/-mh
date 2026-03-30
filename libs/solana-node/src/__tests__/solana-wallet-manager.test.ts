import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getBalance: vi.fn(),
  getAccount: vi.fn(),
  getAssociatedTokenAddress: vi.fn(),
  getMint: vi.fn(),
  sendAndConfirmTransaction: vi.fn(),
  createTransferInstruction: vi.fn(),
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  deriveKeyFromObject: vi.fn(),
}));

vi.mock("@solana/web3.js", () => ({
  Keypair: {
    generate: vi.fn(() => ({
      publicKey: { toBase58: () => "generated-pubkey" },
      secretKey: new Uint8Array([1, 2, 3, 4, 5]),
    })),
    fromSecretKey: vi.fn((bytes: Uint8Array) => ({
      publicKey: { toBase58: () => "restored-pubkey", toString: () => "restored-pubkey" },
      secretKey: bytes,
    })),
  },
  PublicKey: class MockPublicKey {
    _key: string;
    constructor(key: string) {
      if (key === "INVALID") throw new Error("Invalid public key");
      this._key = key;
    }
    toString() { return this._key; }
    toBase58() { return this._key; }
  },
  Connection: class MockConnection {
    getBalance = mocks.getBalance;
  },
  Transaction: class MockTransaction {
    instructions: any[] = [];
    add(...ixs: any[]) {
      this.instructions.push(...ixs);
      return this;
    }
  },
  SystemProgram: {
    transfer: vi.fn(() => ({ programId: "system" })),
  },
  LAMPORTS_PER_SOL: 1_000_000_000,
  sendAndConfirmTransaction: mocks.sendAndConfirmTransaction,
}));

vi.mock("@solana/spl-token", () => ({
  getAccount: mocks.getAccount,
  getAssociatedTokenAddress: mocks.getAssociatedTokenAddress,
  createTransferInstruction: mocks.createTransferInstruction,
  TOKEN_PROGRAM_ID: "token-program-id",
  getMint: mocks.getMint,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => ({ type: "eq", val })),
}));

vi.mock("bs58", () => ({
  default: {
    encode: (bytes: Uint8Array) => Buffer.from(bytes).toString("hex"),
    decode: (str: string) => Buffer.from(str, "hex"),
  },
}));

vi.mock("@libs/crypto-utils", () => ({
  WalletManager: class MockWalletManager {
    config: any;
    constructor(config: any) { this.config = config; }
    async getOrCreateWallet(identifier: string) {
      const existing = await (this as any).getWalletByIdentifier(identifier);
      if (existing) return existing;
      const { address } = await (this as any).generateWallet();
      return (this as any).createWallet(identifier, address, "encrypted", "iv");
    }
    async getDecryptedPrivateKey(_wallet: any) {
      return "decrypted-private-key-hex";
    }
  },
  custodialWalletsSchema: {
    keyIdentifier: "keyIdentifier",
    id: "id",
  },
  deriveKeyFromObject: mocks.deriveKeyFromObject,
}));

import { SolanaWalletManager } from "../custodial-wallets/solana-wallet-manager";

describe("SolanaWalletManager", () => {
  let manager: SolanaWalletManager;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{
            id: 1,
            keyIdentifier: "test-id",
            address: "generated-pubkey",
            encryptedPrivateKey: "encrypted",
            iv: "iv",
            chainType: "solana",
          }]),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{
              id: 1,
              address: "updated",
            }]),
          })),
        })),
      })),
    };

    manager = new SolanaWalletManager({
      database: mockDb,
      connection: { getBalance: mocks.getBalance } as any,
      encryptionKey: "test-key-0123456789abcdef",
    });
  });

  describe("generateWallet", () => {
    it("generates a keypair and returns address + privateKey", async () => {
      const result = await manager.generateWallet();

      expect(result.address).toBe("generated-pubkey");
      expect(result.privateKey).toBeDefined();
    });
  });

  describe("validateAddress", () => {
    it("returns true for valid address", () => {
      expect(manager.validateAddress("valid-address")).toBe(true);
    });

    it("returns false for invalid address", () => {
      expect(manager.validateAddress("INVALID")).toBe(false);
    });
  });

  describe("getWalletByIdentifier", () => {
    it("returns wallet when found", async () => {
      const storedWallet = { id: 1, keyIdentifier: "test", address: "addr" };
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([storedWallet]),
          })),
        })),
      });

      const result = await manager.getWalletByIdentifier("test");

      expect(result).toEqual(storedWallet);
    });

    it("returns null when not found", async () => {
      const result = await manager.getWalletByIdentifier("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("createWallet", () => {
    it("inserts a wallet into the database", async () => {
      const result = await manager.createWallet("id", "addr", "enc", "iv");

      expect(result.chainType).toBe("solana");
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe("updateWallet", () => {
    it("updates wallet in database", async () => {
      const result = await manager.updateWallet("1", { address: "new-addr" } as any);

      expect(result).toBeDefined();
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe("getOrCreateWalletForObject", () => {
    it("derives key from object and delegates to getOrCreateWallet", async () => {
      mocks.deriveKeyFromObject.mockReturnValue("derived-key");

      const result = await manager.getOrCreateWalletForObject({ type: "route", id: "1" } as any);

      expect(mocks.deriveKeyFromObject).toHaveBeenCalledWith({ type: "route", id: "1" });
      expect(result).toBeDefined();
    });
  });

  describe("getKeypairFromWallet", () => {
    it("decrypts private key and creates keypair", async () => {
      const wallet = { address: "addr", encryptedPrivateKey: "enc", iv: "iv" } as any;
      const keypair = await manager.getKeypairFromWallet(wallet);

      expect(keypair).toBeDefined();
    });
  });

  describe("getBalance", () => {
    it("returns SOL balance", async () => {
      mocks.getBalance.mockResolvedValue(2_000_000_000);

      const result = await manager.getBalance({ address: "addr" } as any);

      expect(result).toBe("2");
    });

    it("returns zero balance", async () => {
      mocks.getBalance.mockResolvedValue(0);

      const result = await manager.getBalance({ address: "addr" } as any);

      expect(result).toBe("0");
    });
  });

  describe("getSPLTokenBalance", () => {
    it("returns token balance", async () => {
      mocks.getAssociatedTokenAddress.mockResolvedValue("ata");
      mocks.getAccount.mockResolvedValue({ amount: BigInt(1_000_000) });
      mocks.getMint.mockResolvedValue({ decimals: 6 });

      const result = await manager.getSPLTokenBalance(
        { address: "wallet" } as any,
        "mint-addr"
      );

      expect(result).toBe("1");
    });

    it("returns 0 on error", async () => {
      mocks.getAssociatedTokenAddress.mockRejectedValue(new Error("not found"));

      const result = await manager.getSPLTokenBalance(
        { address: "wallet" } as any,
        "mint-addr"
      );

      expect(result).toBe("0");
    });
  });

  describe("withdrawSOL", () => {
    it("creates and sends SOL transfer transaction", async () => {
      mocks.sendAndConfirmTransaction.mockResolvedValue("tx-signature");

      const result = await manager.withdrawSOL(
        { address: "from", encryptedPrivateKey: "enc", iv: "iv" } as any,
        "to-address",
        "1.5"
      );

      expect(result).toBe("tx-signature");
      expect(mocks.sendAndConfirmTransaction).toHaveBeenCalled();
    });
  });

  describe("withdrawSPLToken", () => {
    it("creates and sends SPL token transfer", async () => {
      mocks.getAssociatedTokenAddress.mockResolvedValue("ata");
      mocks.getMint.mockResolvedValue({ decimals: 6 });
      mocks.createTransferInstruction.mockReturnValue({ programId: "spl" });
      mocks.sendAndConfirmTransaction.mockResolvedValue("spl-tx-sig");

      const result = await manager.withdrawSPLToken(
        { address: "from", encryptedPrivateKey: "enc", iv: "iv" } as any,
        "mint",
        "to-address",
        "100"
      );

      expect(result).toBe("spl-tx-sig");
    });
  });
});
