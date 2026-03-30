import { describe, it, expect } from "vitest";
import {
  utcNow,
  toUtc,
  createUtcDate,
  addTime,
  isInPast,
  isInFuture,
  timeDifference,
  toIsoString,
  fromIsoString,
  scheduleHopExecution,
  isHopOverdue,
  minutesUntilScheduled,
  isValidUtcDate,
  parseUserDateToUtc,
} from "../utils/timezone";

describe("utcNow", () => {
  it("returns a Date", () => {
    expect(utcNow()).toBeInstanceOf(Date);
  });

  it("is close to current time", () => {
    const before = Date.now();
    const now = utcNow();
    const after = Date.now();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });
});

describe("toUtc", () => {
  it("converts a Date to a new Date with same time", () => {
    const d = new Date("2024-06-15T12:00:00Z");
    const result = toUtc(d);
    expect(result.getTime()).toBe(d.getTime());
    expect(result).not.toBe(d); // new instance
  });

  it("parses ISO string with Z", () => {
    const result = toUtc("2024-06-15T12:00:00Z");
    expect(result.toISOString()).toBe("2024-06-15T12:00:00.000Z");
  });

  it("treats plain date string as UTC by appending Z", () => {
    const result = toUtc("2024-06-15");
    expect(result.getUTCFullYear()).toBe(2024);
    expect(result.getUTCMonth()).toBe(5); // June = 5
    expect(result.getUTCDate()).toBe(15);
  });

  it("handles string with timezone offset", () => {
    const result = toUtc("2024-06-15T12:00:00+02:00");
    expect(result.toISOString()).toBe("2024-06-15T10:00:00.000Z");
  });
});

describe("createUtcDate", () => {
  it("creates correct UTC date", () => {
    const d = createUtcDate(2024, 0, 15, 10, 30, 45);
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCHours()).toBe(10);
    expect(d.getUTCMinutes()).toBe(30);
    expect(d.getUTCSeconds()).toBe(45);
  });

  it("defaults hours/minutes/seconds to 0", () => {
    const d = createUtcDate(2024, 5, 1);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
  });
});

describe("addTime", () => {
  it("adds days", () => {
    const base = createUtcDate(2024, 0, 1);
    const result = addTime(base, { days: 10 });
    expect(result.getUTCDate()).toBe(11);
  });

  it("adds hours and minutes", () => {
    const base = createUtcDate(2024, 0, 1, 10, 0, 0);
    const result = addTime(base, { hours: 2, minutes: 30 });
    expect(result.getUTCHours()).toBe(12);
    expect(result.getUTCMinutes()).toBe(30);
  });

  it("adds months", () => {
    const base = createUtcDate(2024, 0, 15);
    const result = addTime(base, { months: 3 });
    expect(result.getUTCMonth()).toBe(3); // April
  });

  it("adds years", () => {
    const base = createUtcDate(2024, 0, 1);
    const result = addTime(base, { years: 2 });
    expect(result.getUTCFullYear()).toBe(2026);
  });

  it("adds milliseconds", () => {
    const base = createUtcDate(2024, 0, 1);
    const result = addTime(base, { milliseconds: 500 });
    expect(result.getUTCMilliseconds()).toBe(500);
  });

  it("does not mutate original date", () => {
    const base = createUtcDate(2024, 0, 1);
    const originalTime = base.getTime();
    addTime(base, { days: 5 });
    expect(base.getTime()).toBe(originalTime);
  });
});

describe("isInPast / isInFuture", () => {
  it("past date is in past", () => {
    const past = new Date(Date.now() - 100000);
    expect(isInPast(past)).toBe(true);
    expect(isInFuture(past)).toBe(false);
  });

  it("future date is in future", () => {
    const future = new Date(Date.now() + 100000);
    expect(isInFuture(future)).toBe(true);
    expect(isInPast(future)).toBe(false);
  });
});

describe("timeDifference", () => {
  it("returns positive when date1 > date2", () => {
    const a = new Date("2024-06-15T12:00:00Z");
    const b = new Date("2024-06-15T10:00:00Z");
    expect(timeDifference(a, b)).toBe(2 * 60 * 60 * 1000);
  });

  it("returns negative when date1 < date2", () => {
    const a = new Date("2024-06-15T10:00:00Z");
    const b = new Date("2024-06-15T12:00:00Z");
    expect(timeDifference(a, b)).toBe(-2 * 60 * 60 * 1000);
  });
});

describe("toIsoString / fromIsoString", () => {
  it("round-trips through ISO string", () => {
    const d = createUtcDate(2024, 5, 15, 10, 30, 45);
    const iso = toIsoString(d);
    const parsed = fromIsoString(iso);
    expect(parsed.getTime()).toBe(d.getTime());
  });
});

describe("scheduleHopExecution", () => {
  it("returns a date in the future by given minutes", () => {
    const before = Date.now();
    const scheduled = scheduleHopExecution(5);
    const after = Date.now();

    const expectedMin = before + 5 * 60 * 1000;
    const expectedMax = after + 5 * 60 * 1000;
    expect(scheduled.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(scheduled.getTime()).toBeLessThanOrEqual(expectedMax);
  });
});

describe("isHopOverdue", () => {
  it("returns true when scheduled time is in the past", () => {
    const past = new Date(Date.now() - 60000);
    expect(isHopOverdue(past)).toBe(true);
  });

  it("returns false when scheduled time is in the future", () => {
    const future = new Date(Date.now() + 60000);
    expect(isHopOverdue(future)).toBe(false);
  });

  it("uses provided currentTime for comparison", () => {
    const scheduled = new Date("2024-06-15T10:00:00Z");
    const current = new Date("2024-06-15T11:00:00Z");
    expect(isHopOverdue(scheduled, current)).toBe(true);
  });
});

describe("minutesUntilScheduled", () => {
  it("returns positive minutes for future time", () => {
    const now = new Date("2024-06-15T10:00:00Z");
    const scheduled = new Date("2024-06-15T10:05:00Z");
    expect(minutesUntilScheduled(scheduled, now)).toBe(5);
  });

  it("returns negative minutes for past time", () => {
    const now = new Date("2024-06-15T10:05:00Z");
    const scheduled = new Date("2024-06-15T10:00:00Z");
    expect(minutesUntilScheduled(scheduled, now)).toBe(-5); // ceil(-5) = -5
  });
});

describe("isValidUtcDate", () => {
  it("returns true for valid Date", () => {
    expect(isValidUtcDate(new Date())).toBe(true);
  });

  it("returns false for invalid Date", () => {
    expect(isValidUtcDate(new Date("invalid"))).toBe(false);
  });

  it("returns false for non-Date values", () => {
    expect(isValidUtcDate("2024-01-01")).toBe(false);
    expect(isValidUtcDate(null)).toBe(false);
    expect(isValidUtcDate(undefined)).toBe(false);
    expect(isValidUtcDate(12345)).toBe(false);
  });
});

describe("parseUserDateToUtc", () => {
  it("handles Date input", () => {
    const d = new Date("2024-06-15T12:00:00Z");
    const result = parseUserDateToUtc(d);
    expect(result.getTime()).toBe(d.getTime());
  });

  it("handles number input (timestamp)", () => {
    const ts = Date.now();
    const result = parseUserDateToUtc(ts);
    expect(result.getTime()).toBe(ts);
  });

  it("handles string input", () => {
    const result = parseUserDateToUtc("2024-06-15T12:00:00Z");
    expect(result.toISOString()).toBe("2024-06-15T12:00:00.000Z");
  });

  it("throws for invalid date input", () => {
    expect(() => parseUserDateToUtc("not-a-date")).toThrow("Invalid date input");
  });
});
