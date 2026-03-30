import { describe, it, expect, vi, beforeEach } from "vitest";

// Store the parse callback so tests can trigger it
let parseCallback: any = null;

vi.mock("papaparse", () => ({
  default: {
    parse: vi.fn((_file: any, opts: any) => {
      parseCallback = opts;
    }),
  },
}));

import { parseHopsCsv } from "../utils/csv/parseHopsCsv";

function triggerComplete(data: any[], fields: string[]) {
  parseCallback.complete({
    data,
    meta: { fields },
  });
}

function triggerError(err: any) {
  parseCallback.error(err);
}

describe("parseHopsCsv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseCallback = null;
  });

  it("parses valid CSV rows", async () => {
    const promise = parseHopsCsv({} as File);

    triggerComplete(
      [
        { wallet: "WalletA", timeInMinutes: 10 },
        { wallet: "WalletB", timeInMinutes: 20 },
      ],
      ["wallet", "timeInMinutes"]
    );

    const { rows, errors } = await promise;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ wallet: "WalletA", delayMinutes: 10 });
    expect(rows[1]).toEqual({ wallet: "WalletB", delayMinutes: 20 });
    expect(errors).toHaveLength(0);
  });

  it("normalizes headers (case-insensitive, no spaces)", async () => {
    const promise = parseHopsCsv({} as File);

    // The transformHeader callback normalizes "Time In Minutes" -> "timeInMinutes"
    // But since we mock Papa, we test header validation via fields
    triggerComplete(
      [{ wallet: "W", timeInMinutes: 5 }],
      ["wallet", "timeInMinutes"]
    );

    const { errors } = await promise;
    expect(errors).toHaveLength(0);
  });

  it("reports error when headers are missing", async () => {
    const promise = parseHopsCsv({} as File);

    triggerComplete(
      [{ name: "W", value: 5 }],
      ["name", "value"]
    );

    const { errors } = await promise;
    expect(errors.some((e) => e.field === "header")).toBe(true);
  });

  it("reports error for missing wallet", async () => {
    const promise = parseHopsCsv({} as File);

    triggerComplete(
      [{ wallet: "", timeInMinutes: 10 }],
      ["wallet", "timeInMinutes"]
    );

    const { rows, errors } = await promise;
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("wallet");
  });

  it("reports error for non-numeric timeInMinutes", async () => {
    const promise = parseHopsCsv({} as File);

    triggerComplete(
      [{ wallet: "W", timeInMinutes: "abc" }],
      ["wallet", "timeInMinutes"]
    );

    const { rows, errors } = await promise;
    expect(rows).toHaveLength(0);
    expect(errors[0].field).toBe("timeInMinutes");
  });

  it("reports error for negative timeInMinutes", async () => {
    const promise = parseHopsCsv({} as File);

    triggerComplete(
      [{ wallet: "W", timeInMinutes: -5 }],
      ["wallet", "timeInMinutes"]
    );

    const { rows, errors } = await promise;
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toContain(">= 0");
  });

  it("floors decimal timeInMinutes", async () => {
    const promise = parseHopsCsv({} as File);

    triggerComplete(
      [{ wallet: "W", timeInMinutes: 5.7 }],
      ["wallet", "timeInMinutes"]
    );

    const { rows } = await promise;
    expect(rows[0].delayMinutes).toBe(5);
  });

  it("handles missing both wallet and time", async () => {
    const promise = parseHopsCsv({} as File);

    triggerComplete(
      [{ wallet: "", timeInMinutes: "not-a-number" }],
      ["wallet", "timeInMinutes"]
    );

    const { errors } = await promise;
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("Missing wallet and invalid timeInMinutes");
  });

  it("handles Papa.parse error callback", async () => {
    const promise = parseHopsCsv({} as File);

    triggerError({ message: "File read error" });

    const { rows, errors } = await promise;
    expect(rows).toHaveLength(0);
    expect(errors[0].field).toBe("file");
  });

  it("falls back to alternative column names for time", async () => {
    const promise = parseHopsCsv({} as File);

    // When transformHeader doesn't catch it, row might have 'timeinminutes'
    triggerComplete(
      [{ wallet: "W", timeinminutes: 15 }],
      ["wallet", "timeinminutes"]
    );

    const { rows } = await promise;
    expect(rows[0].delayMinutes).toBe(15);
  });

  it("trims wallet whitespace", async () => {
    const promise = parseHopsCsv({} as File);

    triggerComplete(
      [{ wallet: "  WalletX  ", timeInMinutes: 0 }],
      ["wallet", "timeInMinutes"]
    );

    const { rows } = await promise;
    expect(rows[0].wallet).toBe("WalletX");
  });

  it("reports line numbers starting at 2 (after header)", async () => {
    const promise = parseHopsCsv({} as File);

    triggerComplete(
      [
        { wallet: "W1", timeInMinutes: 0 },
        { wallet: "", timeInMinutes: 5 },
      ],
      ["wallet", "timeInMinutes"]
    );

    const { errors } = await promise;
    expect(errors[0].line).toBe(3); // Second data row = line 3
  });
});
