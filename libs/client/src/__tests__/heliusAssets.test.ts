import { describe, it, expect } from "vitest";
import {
  isObject,
  hasContentFiles,
  hasContentMetadata,
  hasTokenInfo,
} from "../utils/heliusAssets";

describe("heliusAssets type guards", () => {
  describe("isObject", () => {
    it("returns true for plain objects", () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
    });

    it("returns true for arrays (typeof object)", () => {
      expect(isObject([])).toBe(true);
    });

    it("returns false for null", () => {
      expect(isObject(null)).toBe(false);
    });

    it("returns false for primitives", () => {
      expect(isObject(undefined)).toBe(false);
      expect(isObject(42)).toBe(false);
      expect(isObject("string")).toBe(false);
      expect(isObject(true)).toBe(false);
    });
  });

  describe("hasContentFiles", () => {
    it("returns true when content.files is an array", () => {
      const asset = { content: { files: [{ uri: "https://example.com" }] } };
      expect(hasContentFiles(asset)).toBe(true);
    });

    it("returns true for empty files array", () => {
      expect(hasContentFiles({ content: { files: [] } })).toBe(true);
    });

    it("returns false when content is missing", () => {
      expect(hasContentFiles({})).toBe(false);
    });

    it("returns false when content is not an object", () => {
      expect(hasContentFiles({ content: "string" })).toBe(false);
    });

    it("returns false when files is not an array", () => {
      expect(hasContentFiles({ content: { files: "not-array" } })).toBe(false);
    });

    it("returns false for non-objects", () => {
      expect(hasContentFiles(null)).toBe(false);
      expect(hasContentFiles(42)).toBe(false);
    });
  });

  describe("hasContentMetadata", () => {
    it("returns true when content.metadata is an object", () => {
      const asset = {
        content: { metadata: { name: "Token", symbol: "TKN" } },
      };
      expect(hasContentMetadata(asset)).toBe(true);
    });

    it("returns true for empty metadata object", () => {
      expect(hasContentMetadata({ content: { metadata: {} } })).toBe(true);
    });

    it("returns false when metadata is missing", () => {
      expect(hasContentMetadata({ content: {} })).toBe(false);
    });

    it("returns false when metadata is not an object", () => {
      expect(hasContentMetadata({ content: { metadata: "string" } })).toBe(
        false
      );
    });

    it("returns false when content is missing", () => {
      expect(hasContentMetadata({})).toBe(false);
    });

    it("returns false for non-objects", () => {
      expect(hasContentMetadata(null)).toBe(false);
      expect(hasContentMetadata(undefined)).toBe(false);
    });
  });

  describe("hasTokenInfo", () => {
    it("returns true when token_info exists", () => {
      const asset = { token_info: { decimals: 9, balance: 1000 } };
      expect(hasTokenInfo(asset)).toBe(true);
    });

    it("returns true even with empty token_info", () => {
      expect(hasTokenInfo({ token_info: {} })).toBe(true);
    });

    it("returns false when token_info is missing", () => {
      expect(hasTokenInfo({})).toBe(false);
    });

    it("returns false for non-objects", () => {
      expect(hasTokenInfo(null)).toBe(false);
      expect(hasTokenInfo("string")).toBe(false);
    });
  });
});
