import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { decodeUTF8 } from "tweetnacl-util";
import bs58 from "bs58";

import {
  generateNonce,
  createMessage,
  verifySignature,
  createChallenge,
} from "../auth/services/auth.service";

describe("auth.service", () => {
  describe("generateNonce", () => {
    it("should return a string of at least 8 characters", () => {
      const nonce = generateNonce();
      expect(typeof nonce).toBe("string");
      expect(nonce.length).toBeGreaterThanOrEqual(8);
    });

    it("should return a string of at most 19 characters", () => {
      // length = Math.max(8, Math.floor(Math.random() * 12) + 8)
      // max random = 11 + 8 = 19
      const nonce = generateNonce();
      expect(nonce.length).toBeLessThanOrEqual(19);
    });

    it("should only contain alphanumeric characters", () => {
      const nonce = generateNonce();
      expect(nonce).toMatch(/^[A-Za-z0-9]+$/);
    });

    it("should generate unique nonces", () => {
      const nonces = new Set(Array.from({ length: 50 }, () => generateNonce()));
      // With high entropy, collisions should be virtually impossible
      expect(nonces.size).toBe(50);
    });
  });

  describe("createMessage", () => {
    it("should include the nonce in the message", () => {
      const nonce = "testNonce123";
      const message = createMessage(nonce);
      expect(message).toContain(nonce);
    });

    it("should produce a welcome message with the nonce appended", () => {
      const message = createMessage("abc");
      expect(message).toBe(
        "Welcome to the application. Sign this message to prove you own this address: abc"
      );
    });
  });

  describe("verifySignature", () => {
    it("should throw when nonce is empty", async () => {
      await expect(
        verifySignature("addr", "", "sig")
      ).rejects.toThrow("Missing nonce");
    });

    it("should throw when signature is empty", async () => {
      await expect(
        verifySignature("addr", "nonce", "")
      ).rejects.toThrow("Missing signature");
    });

    it("should return true for a valid standard wallet signature", async () => {
      // Generate a real keypair
      const keypair = nacl.sign.keyPair();
      const publicKey = new PublicKey(keypair.publicKey);
      const nonce = "testNonce";
      const messageBytes = decodeUTF8(createMessage(nonce));
      const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
      const signatureB58 = bs58.encode(signatureBytes);

      const result = await verifySignature(
        publicKey.toBase58(),
        nonce,
        signatureB58,
        false
      );
      expect(result).toBe(true);
    });

    it("should return false for an invalid standard wallet signature", async () => {
      // Generate two different keypairs
      const keypair1 = nacl.sign.keyPair();
      const keypair2 = nacl.sign.keyPair();
      const publicKey = new PublicKey(keypair1.publicKey);
      const nonce = "testNonce";
      const messageBytes = decodeUTF8(createMessage(nonce));
      // Sign with keypair2 but verify against keypair1's public key
      const signatureBytes = nacl.sign.detached(
        messageBytes,
        keypair2.secretKey
      );
      const signatureB58 = bs58.encode(signatureBytes);

      const result = await verifySignature(
        publicKey.toBase58(),
        nonce,
        signatureB58,
        false
      );
      expect(result).toBe(false);
    });

    it("should throw for hardware wallet with no memo instruction", async () => {
      // Create a minimal serialized transaction (will fail to parse properly)
      // Pass isHardwareWallet=true with invalid transaction data
      await expect(
        verifySignature("11111111111111111111111111111112", "nonce", "3Esmgf", true)
      ).rejects.toThrow("Error validating signature");
    });

    it("should throw on completely invalid signature data", async () => {
      await expect(
        verifySignature("invalidAddress", "nonce", "badSig", false)
      ).rejects.toThrow("Error validating signature");
    });
  });

  describe("createChallenge", () => {
    it("should return an object with nonce and message", () => {
      const challenge = createChallenge();
      expect(challenge).toHaveProperty("nonce");
      expect(challenge).toHaveProperty("message");
    });

    it("should have a message that contains the nonce", () => {
      const challenge = createChallenge();
      expect(challenge.message).toContain(challenge.nonce);
    });

    it("should generate different challenges each time", () => {
      const c1 = createChallenge();
      const c2 = createChallenge();
      expect(c1.nonce).not.toBe(c2.nonce);
    });
  });
});
