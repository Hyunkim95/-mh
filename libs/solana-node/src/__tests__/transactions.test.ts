import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendAndConfirmTransaction: vi.fn(),
  getSignatureStatus: vi.fn(),
}));

vi.mock("@solana/web3.js", () => ({
  Connection: class MockConnection {
    getSignatureStatus = mocks.getSignatureStatus;
  },
  Transaction: class {},
  Keypair: class {},
  sendAndConfirmTransaction: mocks.sendAndConfirmTransaction,
}));

import { sendTransaction, getTransactionStatus } from "../transactions";

describe("transactions", () => {
  describe("sendTransaction", () => {
    it("sends and confirms a transaction", async () => {
      mocks.sendAndConfirmTransaction.mockResolvedValue("tx-sig-123");

      const result = await sendTransaction(
        {} as any,
        {} as any,
        []
      );

      expect(result).toBe("tx-sig-123");
    });
  });

  describe("getTransactionStatus", () => {
    it("returns signature status", async () => {
      const mockStatus = { value: { confirmationStatus: "confirmed" } };
      mocks.getSignatureStatus.mockResolvedValue(mockStatus);

      const conn = new (await import("@solana/web3.js")).Connection("https://rpc.test") as any;
      const result = await getTransactionStatus(conn, "sig-123");

      expect(result).toEqual(mockStatus);
    });
  });
});
