import { describe, it, expect } from "vitest";
import { generateWallet, walletFromSecretKey, isValidPublicKey } from "../wallet";
import { Keypair } from "@solana/web3.js";

describe("generateWallet", () => {
  it("returns a Keypair", () => {
    const wallet = generateWallet();
    expect(wallet).toBeInstanceOf(Keypair);
  });

  it("generates unique wallets", () => {
    const a = generateWallet();
    const b = generateWallet();
    expect(a.publicKey.toBase58()).not.toBe(b.publicKey.toBase58());
  });
});

describe("walletFromSecretKey", () => {
  it("restores a keypair from secret key", () => {
    const original = generateWallet();
    const restored = walletFromSecretKey(original.secretKey);
    expect(restored.publicKey.toBase58()).toBe(original.publicKey.toBase58());
  });
});

describe("isValidPublicKey", () => {
  it("returns true for valid base58 public key", () => {
    const wallet = generateWallet();
    expect(isValidPublicKey(wallet.publicKey.toBase58())).toBe(true);
  });

  it("returns true for known valid addresses", () => {
    expect(isValidPublicKey("11111111111111111111111111111112")).toBe(true);
    expect(isValidPublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")).toBe(true);
  });

  it("returns false for invalid strings", () => {
    expect(isValidPublicKey("")).toBe(false);
    expect(isValidPublicKey("not-a-key")).toBe(false);
    expect(isValidPublicKey("0x1234")).toBe(false);
  });
});
