import { describe, it, expect } from "vitest";
import { extractErrorMessage } from "../utils/extractErrorMessage";

describe("extractErrorMessage", () => {
  it("returns fallback for null/undefined", () => {
    expect(extractErrorMessage(null)).toBe("An unexpected error occurred");
    expect(extractErrorMessage(undefined)).toBe("An unexpected error occurred");
  });

  it("uses custom fallback", () => {
    expect(extractErrorMessage(null, "Custom fallback")).toBe("Custom fallback");
  });

  it("extracts message from tRPC shape.message", () => {
    const error = {
      message: "INTERNAL_SERVER_ERROR",
      shape: { message: "Actual error details" },
    };
    expect(extractErrorMessage(error)).toBe("Actual error details");
  });

  it("extracts message from tRPC data.message", () => {
    const error = {
      message: "INTERNAL_SERVER_ERROR",
      data: { message: "Data-level error" },
    };
    expect(extractErrorMessage(error)).toBe("Data-level error");
  });

  it("prefers shape.message over data.message", () => {
    const error = {
      shape: { message: "Shape message" },
      data: { message: "Data message" },
    };
    expect(extractErrorMessage(error)).toBe("Shape message");
  });

  it("falls back to error.message when not a generic code", () => {
    const error = { message: "Something specific went wrong" };
    expect(extractErrorMessage(error)).toBe("Something specific went wrong");
  });

  it("skips generic code messages and returns fallback", () => {
    const codes = [
      "INTERNAL_SERVER_ERROR",
      "BAD_REQUEST",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
    ];
    for (const code of codes) {
      expect(extractErrorMessage({ message: code })).toBe(
        "An unexpected error occurred"
      );
    }
  });

  it("extracts message from standard Error", () => {
    expect(extractErrorMessage(new Error("Standard error"))).toBe(
      "Standard error"
    );
  });

  it("returns string errors directly", () => {
    expect(extractErrorMessage("Direct string error")).toBe(
      "Direct string error"
    );
  });

  it("returns fallback for non-string, non-object errors", () => {
    expect(extractErrorMessage(42)).toBe("An unexpected error occurred");
    expect(extractErrorMessage(true)).toBe("An unexpected error occurred");
  });
});
