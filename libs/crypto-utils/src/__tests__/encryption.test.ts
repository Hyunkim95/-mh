import { describe, it, expect } from "vitest";
import { encryptPrivateKey, decryptPrivateKey } from "../encryption";

describe("encryption", () => {
  const testKey = "my-super-secret-encryption-key";
  const testPrivateKey =
    "5KYZdUEo39z3FPrtuX2QbbwGnNP5zTd7yyr2SC1j299sBCnWjss";

  describe("encryptPrivateKey", () => {
    it("returns encrypted string and iv", () => {
      const result = encryptPrivateKey(testPrivateKey, testKey);
      expect(result).toHaveProperty("encrypted");
      expect(result).toHaveProperty("iv");
      expect(result.encrypted).not.toBe(testPrivateKey);
      expect(result.iv).toHaveLength(32); // 16 bytes hex-encoded
    });

    it("produces different output each time (random IV)", () => {
      const a = encryptPrivateKey(testPrivateKey, testKey);
      const b = encryptPrivateKey(testPrivateKey, testKey);
      expect(a.encrypted).not.toBe(b.encrypted);
      expect(a.iv).not.toBe(b.iv);
    });
  });

  describe("decryptPrivateKey", () => {
    it("round-trips encrypt then decrypt", () => {
      const encrypted = encryptPrivateKey(testPrivateKey, testKey);
      const decrypted = decryptPrivateKey(encrypted, testKey);
      expect(decrypted).toBe(testPrivateKey);
    });

    it("fails with wrong encryption key", () => {
      const encrypted = encryptPrivateKey(testPrivateKey, testKey);
      expect(() =>
        decryptPrivateKey(encrypted, "wrong-key")
      ).toThrow();
    });

    it("handles empty string private key", () => {
      const encrypted = encryptPrivateKey("", testKey);
      const decrypted = decryptPrivateKey(encrypted, testKey);
      expect(decrypted).toBe("");
    });

    it("handles long private key", () => {
      const longKey = "A".repeat(1000);
      const encrypted = encryptPrivateKey(longKey, testKey);
      const decrypted = decryptPrivateKey(encrypted, testKey);
      expect(decrypted).toBe(longKey);
    });
  });
});
