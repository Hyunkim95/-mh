import { describe, it, expect } from "vitest";
import {
  convertTimestampToRouteInput,
  convertHumanReadableToRouteInput,
  convertRouteInputToHumanReadable,
  convertDatabaseHopsToTimestamp,
  convertTimestampHopsToIHopInput,
  convertDatabaseHopsToHumanReadable,
  convertHumanReadableHopsToIHopInput,
} from "../types/route";

describe("route conversion utilities", () => {
  describe("convertTimestampToRouteInput", () => {
    it("converts hop amount to raw units with default 6 decimals", () => {
      const result = convertTimestampToRouteInput({
        hopAmountTokens: "1.5",
        hops: [
          { recipient: "A", scheduledAt: "2024-01-15T12:00:00Z" },
        ],
      });
      expect(result.hopAmount).toBe("1500000");
    });

    it("converts hop amount with custom decimals", () => {
      const result = convertTimestampToRouteInput(
        {
          hopAmountTokens: "1",
          hops: [{ recipient: "A", scheduledAt: "2024-01-15T12:00:00Z" }],
        },
        9
      );
      expect(result.hopAmount).toBe("1000000000");
    });

    it("first hop gets delaySeconds=0", () => {
      const result = convertTimestampToRouteInput({
        hopAmountTokens: "1",
        hops: [{ recipient: "A", scheduledAt: "2024-01-15T12:00:00Z" }],
      });
      expect(result.hops[0].delaySeconds).toBe("0");
    });

    it("calculates delay between consecutive hops", () => {
      const result = convertTimestampToRouteInput({
        hopAmountTokens: "1",
        hops: [
          { recipient: "A", scheduledAt: "2024-01-15T12:00:00Z" },
          { recipient: "B", scheduledAt: "2024-01-15T12:30:00Z" },
          { recipient: "C", scheduledAt: "2024-01-15T13:00:00Z" },
        ],
      });
      expect(result.hops[0].delaySeconds).toBe("0");
      expect(result.hops[1].delaySeconds).toBe("1800"); // 30 min
      expect(result.hops[2].delaySeconds).toBe("1800"); // 30 min
    });

    it("clamps negative delays to 0", () => {
      const result = convertTimestampToRouteInput({
        hopAmountTokens: "1",
        hops: [
          { recipient: "A", scheduledAt: "2024-01-15T13:00:00Z" },
          { recipient: "B", scheduledAt: "2024-01-15T12:00:00Z" }, // earlier
        ],
      });
      expect(result.hops[1].delaySeconds).toBe("0");
    });

    it("passes through splMint", () => {
      const result = convertTimestampToRouteInput({
        hopAmountTokens: "1",
        splMint: "Mint123",
        hops: [{ recipient: "A", scheduledAt: "2024-01-15T12:00:00Z" }],
      });
      expect(result.splMint).toBe("Mint123");
    });
  });

  describe("convertHumanReadableToRouteInput", () => {
    it("converts hop amount and delays", () => {
      const result = convertHumanReadableToRouteInput({
        hopAmountTokens: "2",
        hops: [
          { recipient: "A", delayMinutes: "0" },
          { recipient: "B", delayMinutes: "30" },
        ],
      });
      expect(result.hopAmount).toBe("2000000");
      expect(result.hops[0].delaySeconds).toBe("0");
      expect(result.hops[1].delaySeconds).toBe("1800");
    });
  });

  describe("convertRouteInputToHumanReadable", () => {
    it("converts raw amounts and seconds back", () => {
      const result = convertRouteInputToHumanReadable({
        hopAmount: "2000000",
        hops: [
          { recipient: "A", delaySeconds: "0" },
          { recipient: "B", delaySeconds: "1800" },
        ],
      });
      expect(result.hopAmountTokens).toBe("2");
      expect(result.hops[0].delayMinutes).toBe("0");
      expect(result.hops[1].delayMinutes).toBe("30");
    });
  });

  describe("convertDatabaseHopsToTimestamp", () => {
    it("maps database hops to timestamp format", () => {
      const dbHops = [
        {
          id: 1, routeId: 1, hopIndex: 0, recipient: "A",
          scheduledAt: "2024-01-15T12:00:00Z", createdAt: "", updatedAt: "",
        },
        {
          id: 2, routeId: 1, hopIndex: 1, recipient: "B",
          scheduledAt: "2024-01-15T13:00:00Z", createdAt: "", updatedAt: "",
        },
      ];
      const result = convertDatabaseHopsToTimestamp(dbHops);
      expect(result).toEqual([
        { recipient: "A", scheduledAt: "2024-01-15T12:00:00Z" },
        { recipient: "B", scheduledAt: "2024-01-15T13:00:00Z" },
      ]);
    });
  });

  describe("convertTimestampHopsToIHopInput", () => {
    it("calculates delay from timestamps", () => {
      const result = convertTimestampHopsToIHopInput([
        { recipient: "A", scheduledAt: "2024-01-15T12:00:00Z" },
        { recipient: "B", scheduledAt: "2024-01-15T12:10:00Z" },
      ]);
      expect(result[0].delaySeconds).toBe("0");
      expect(result[1].delaySeconds).toBe("600"); // 10 min
    });
  });

  describe("convertDatabaseHopsToHumanReadable", () => {
    it("calculates delay in minutes from database hops", () => {
      const dbHops = [
        {
          id: 1, routeId: 1, hopIndex: 0, recipient: "A",
          scheduledAt: "2024-01-15T12:00:00Z", createdAt: "", updatedAt: "",
        },
        {
          id: 2, routeId: 1, hopIndex: 1, recipient: "B",
          scheduledAt: "2024-01-15T12:30:00Z", createdAt: "", updatedAt: "",
        },
      ];
      const result = convertDatabaseHopsToHumanReadable(dbHops);
      expect(result[0].delayMinutes).toBe("0");
      expect(result[1].delayMinutes).toBe("30");
    });
  });

  describe("convertHumanReadableHopsToIHopInput", () => {
    it("converts minutes to seconds", () => {
      const result = convertHumanReadableHopsToIHopInput([
        { recipient: "A", delayMinutes: "0" },
        { recipient: "B", delayMinutes: "5.5" },
      ]);
      expect(result[0].delaySeconds).toBe("0");
      expect(result[1].delaySeconds).toBe("330");
    });
  });
});
