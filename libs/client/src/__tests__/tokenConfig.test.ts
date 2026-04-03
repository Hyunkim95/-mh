import { describe, it, expect } from "vitest";
import {
  convertHumanReadableToTokenConfigInput,
  convertTokenConfigInputToHumanReadable,
} from "../types/tokenConfig";

describe("tokenConfig conversions", () => {
  describe("convertHumanReadableToTokenConfigInput", () => {
    it("converts percentage to basis points (* 100)", () => {
      const result = convertHumanReadableToTokenConfigInput({
        minTransferAmount: "0.001",
        feeBps: "5", // 5% = 500 bps
        feeTreasury: "Treasury123",
        maxHops: "10",
        maxDelayHours: "1",
        timelockHours: "2",
        flatFeeLamport: "0.001",
      });
      expect(result.feeBps).toBe("500");
    });

    it("converts hours to seconds", () => {
      const result = convertHumanReadableToTokenConfigInput({
        minTransferAmount: "1",
        feeBps: "1",
        feeTreasury: "Treasury",
        maxHops: "5",
        maxDelayHours: "2.5",
        timelockHours: "24",
        flatFeeLamport: "0",
      });
      expect(result.maxDelaySeconds).toBe("9000"); // 2.5 * 3600
      expect(result.timelockSeconds).toBe("86400"); // 24 * 3600
    });

    it("converts SOL to lamports", () => {
      const result = convertHumanReadableToTokenConfigInput({
        minTransferAmount: "1",
        feeBps: "0",
        feeTreasury: "Treasury",
        maxHops: "5",
        maxDelayHours: "0",
        timelockHours: "0",
        flatFeeLamport: "1.5",
      });
      expect(result.flatFeeLamports).toBe("1500000000");
    });

    it("passes through feeTreasury and maxHops unchanged", () => {
      const result = convertHumanReadableToTokenConfigInput({
        minTransferAmount: "1",
        feeBps: "0",
        feeTreasury: "MyTreasury",
        maxHops: "7",
        maxDelayHours: "0",
        timelockHours: "0",
        flatFeeLamport: "0",
      });
      expect(result.feeTreasury).toBe("MyTreasury");
      expect(result.maxHops).toBe("7");
    });

    it("sets minTransfer to 0", () => {
      const result = convertHumanReadableToTokenConfigInput({
        minTransferAmount: "999",
        feeBps: "0",
        feeTreasury: "T",
        maxHops: "1",
        maxDelayHours: "0",
        timelockHours: "0",
        flatFeeLamport: "0",
      });
      expect(result.minTransfer).toBe("0");
    });
  });

  describe("convertTokenConfigInputToHumanReadable", () => {
    it("converts basis points to percentage (/ 100)", () => {
      const result = convertTokenConfigInputToHumanReadable({
        minTransfer: "1000000",
        feeBps: "500",
        feeTreasury: "Treasury",
        maxHops: "10",
        maxDelaySeconds: "3600",
        timelockSeconds: "7200",
        flatFeeLamports: "1000000000",
      });
      expect(result.feeBps).toBe("5"); // 500 / 100
    });

    it("converts seconds to hours", () => {
      const result = convertTokenConfigInputToHumanReadable({
        minTransfer: "0",
        feeBps: "0",
        feeTreasury: "T",
        maxHops: "5",
        maxDelaySeconds: "9000",
        timelockSeconds: "86400",
        flatFeeLamports: "0",
      });
      expect(result.maxDelayHours).toBe("2.5");
      expect(result.timelockHours).toBe("24");
    });

    it("converts lamports to SOL", () => {
      const result = convertTokenConfigInputToHumanReadable({
        minTransfer: "0",
        feeBps: "0",
        feeTreasury: "T",
        maxHops: "5",
        maxDelaySeconds: "0",
        timelockSeconds: "0",
        flatFeeLamports: "1500000000",
      });
      expect(result.flatFeeLamport).toBe("1.5");
    });

    it("converts minTransfer using token decimals", () => {
      const result = convertTokenConfigInputToHumanReadable(
        {
          minTransfer: "1000000",
          feeBps: "0",
          feeTreasury: "T",
          maxHops: "5",
          maxDelaySeconds: "0",
          timelockSeconds: "0",
          flatFeeLamports: "0",
        },
        6
      );
      expect(result.minTransferAmount).toBe("1");
    });

    it("uses default 6 decimals", () => {
      const result = convertTokenConfigInputToHumanReadable({
        minTransfer: "500000",
        feeBps: "0",
        feeTreasury: "T",
        maxHops: "1",
        maxDelaySeconds: "0",
        timelockSeconds: "0",
        flatFeeLamports: "0",
      });
      expect(result.minTransferAmount).toBe("0.5");
    });
  });
});
