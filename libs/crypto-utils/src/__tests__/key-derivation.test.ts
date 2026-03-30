import { describe, it, expect } from "vitest";
import { deriveKeyFromObject } from "../key-derivation";

describe("deriveKeyFromObject", () => {
  it("returns a 64-char hex string (sha256)", () => {
    const result = deriveKeyFromObject({ a: "1" });
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for same input", () => {
    const obj = { foo: "bar", baz: 42 };
    expect(deriveKeyFromObject(obj)).toBe(deriveKeyFromObject(obj));
  });

  it("is order-independent (keys sorted internally)", () => {
    const a = deriveKeyFromObject({ z: "1", a: "2" });
    const b = deriveKeyFromObject({ a: "2", z: "1" });
    expect(a).toBe(b);
  });

  it("differentiates by values", () => {
    const a = deriveKeyFromObject({ key: "value1" });
    const b = deriveKeyFromObject({ key: "value2" });
    expect(a).not.toBe(b);
  });

  it("handles null and undefined values", () => {
    const result = deriveKeyFromObject({ a: null, b: undefined });
    expect(result).toHaveLength(64);
  });

  it("handles boolean values", () => {
    const a = deriveKeyFromObject({ flag: true });
    const b = deriveKeyFromObject({ flag: false });
    expect(a).not.toBe(b);
  });

  it("handles empty object", () => {
    const result = deriveKeyFromObject({});
    expect(result).toHaveLength(64);
  });
});
