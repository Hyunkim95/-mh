import { describe, it, expect, vi, afterEach } from "vitest";
import moment from "moment-timezone";
import {
  getUserTimezone,
  utcToLocal,
  localToUtc,
  formatTimestampForUser,
  formatHopScheduleTime,
  getRelativeTime,
  isHopOverdue,
  getTimeUntilHop,
  parseUserDateForApi,
  utcToDatePickerValue,
  getTimezoneInfo,
  isValidDateString,
  getCommonTimezones,
  scheduleHopFromNow,
} from "../utils/timezone";

describe("client timezone utilities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getUserTimezone", () => {
    it("returns a string timezone", () => {
      const tz = getUserTimezone();
      expect(typeof tz).toBe("string");
      expect(tz.length).toBeGreaterThan(0);
    });
  });

  describe("utcToLocal", () => {
    it("converts UTC timestamp to specified timezone", () => {
      const result = utcToLocal("2024-06-15T12:00:00Z", "America/New_York");
      expect(result.format("YYYY-MM-DD HH:mm:ss")).toBe("2024-06-15 08:00:00");
    });

    it("accepts a Date object", () => {
      const date = new Date("2024-06-15T12:00:00Z");
      const result = utcToLocal(date, "America/New_York");
      expect(result.format("HH:mm")).toBe("08:00");
    });

    it("uses guessed timezone when none provided", () => {
      const result = utcToLocal("2024-06-15T12:00:00Z");
      expect(result.isValid()).toBe(true);
    });
  });

  describe("localToUtc", () => {
    it("converts local time to UTC", () => {
      const result = localToUtc("2024-06-15 08:00:00", "America/New_York");
      expect(result.utc().format("YYYY-MM-DD HH:mm:ss")).toBe(
        "2024-06-15 12:00:00"
      );
    });

    it("uses guessed timezone when none provided", () => {
      const result = localToUtc("2024-06-15 12:00:00");
      expect(result.isValid()).toBe(true);
    });
  });

  describe("formatTimestampForUser", () => {
    it("formats with default format", () => {
      const result = formatTimestampForUser(
        "2024-06-15T12:00:00Z",
        undefined,
        "UTC"
      );
      expect(result).toBe("2024-06-15 12:00:00 UTC");
    });

    it("formats with custom format", () => {
      const result = formatTimestampForUser(
        "2024-06-15T12:00:00Z",
        "HH:mm",
        "UTC"
      );
      expect(result).toBe("12:00");
    });
  });

  describe("formatHopScheduleTime", () => {
    it('shows "Today at" for same-day times', () => {
      const now = moment();
      const later = now.clone().add(2, "hours").utc().toISOString();
      const result = formatHopScheduleTime(later);
      expect(result).toContain("Today at");
    });

    it('shows "Tomorrow at" for next-day times', () => {
      const tomorrow = moment().add(1, "day").startOf("day").add(14, "hours");
      const result = formatHopScheduleTime(
        tomorrow.utc().toISOString(),
        moment.tz.guess()
      );
      expect(result).toContain("Tomorrow at");
    });

    it("shows full date for times more than a week away", () => {
      const farFuture = moment().add(30, "days").utc().toISOString();
      const result = formatHopScheduleTime(farFuture, "UTC");
      expect(result).toMatch(/\w+ \d{2}, \d{4} at \d{2}:\d{2}/);
    });
  });

  describe("getRelativeTime", () => {
    it("returns a relative time string", () => {
      const past = moment.utc().subtract(5, "minutes").toISOString();
      const result = getRelativeTime(past, "UTC");
      expect(result).toContain("minutes ago");
    });
  });

  describe("isHopOverdue", () => {
    it("returns true for past timestamps", () => {
      expect(isHopOverdue("2020-01-01T00:00:00Z")).toBe(true);
    });

    it("returns false for future timestamps", () => {
      expect(isHopOverdue("2099-01-01T00:00:00Z")).toBe(false);
    });
  });

  describe("getTimeUntilHop", () => {
    it("returns isPast=true for overdue hops", () => {
      const result = getTimeUntilHop("2020-01-01T00:00:00Z");
      expect(result.isPast).toBe(true);
      expect(result.formatted).toContain("Overdue by");
      expect(result.humanized).toContain("ago");
    });

    it("returns isPast=false for future hops", () => {
      const future = moment.utc().add(2, "hours").add(30, "minutes");
      const result = getTimeUntilHop(future.toISOString());
      expect(result.isPast).toBe(false);
      expect(result.formatted).toMatch(/\d+h \d+m/);
    });

    it("formats days when > 1 day away", () => {
      const future = moment.utc().add(3, "days").add(2, "hours");
      const result = getTimeUntilHop(future.toISOString());
      expect(result.isPast).toBe(false);
      expect(result.formatted).toMatch(/\d+d \d+h \d+m/);
    });

    it("formats minutes only when < 1 hour away", () => {
      const future = moment.utc().add(30, "minutes");
      const result = getTimeUntilHop(future.toISOString());
      expect(result.isPast).toBe(false);
      expect(result.formatted).toMatch(/^\d+m$/);
    });
  });

  describe("parseUserDateForApi", () => {
    it("converts local date to UTC ISO string", () => {
      const result = parseUserDateForApi(
        "2024-06-15 08:00:00",
        "America/New_York"
      );
      expect(result).toContain("2024-06-15T12:00:00");
    });
  });

  describe("utcToDatePickerValue", () => {
    it("returns a Date object", () => {
      const result = utcToDatePickerValue("2024-06-15T12:00:00Z", "UTC");
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe("getTimezoneInfo", () => {
    it("returns timezone info object for UTC", () => {
      const info = getTimezoneInfo("UTC");
      expect(info.name).toBe("UTC");
      expect(info.abbreviation).toBe("UTC");
      expect(info.offset).toBe("+00:00");
      expect(info.offsetMinutes).toBe(0);
    });

    it("returns timezone info for a specific timezone", () => {
      const info = getTimezoneInfo("America/New_York");
      expect(info.name).toBe("America/New_York");
      expect(typeof info.abbreviation).toBe("string");
      expect(typeof info.offset).toBe("string");
      expect(typeof info.offsetMinutes).toBe("number");
    });
  });

  describe("isValidDateString", () => {
    it("returns true for valid date strings", () => {
      expect(isValidDateString("2024-06-15")).toBe(true);
      expect(isValidDateString("2024-06-15T12:00:00Z")).toBe(true);
    });

    it("returns false for invalid date strings", () => {
      expect(isValidDateString("not-a-date")).toBe(false);
    });
  });

  describe("getCommonTimezones", () => {
    it("returns an array of timezone objects", () => {
      const timezones = getCommonTimezones();
      expect(timezones.length).toBeGreaterThan(0);
      expect(timezones[0]).toHaveProperty("value");
      expect(timezones[0]).toHaveProperty("label");
      expect(timezones[0]).toHaveProperty("offset");
    });

    it("includes UTC", () => {
      const timezones = getCommonTimezones();
      const utc = timezones.find((tz) => tz.value === "UTC");
      expect(utc).toBeDefined();
    });

    it("replaces underscores in labels", () => {
      const timezones = getCommonTimezones();
      const ny = timezones.find((tz) => tz.value === "America/New_York");
      expect(ny?.label).toContain("America/New York");
    });
  });

  describe("scheduleHopFromNow", () => {
    it("returns an object with utcIsoString, localDisplay, and relativeTime", () => {
      const result = scheduleHopFromNow(30, "UTC");
      expect(result).toHaveProperty("utcIsoString");
      expect(result).toHaveProperty("localDisplay");
      expect(result).toHaveProperty("relativeTime");
    });

    it("schedules correctly in the future", () => {
      const result = scheduleHopFromNow(60, "UTC");
      const scheduled = new Date(result.utcIsoString);
      const now = new Date();
      const diffMinutes = (scheduled.getTime() - now.getTime()) / (1000 * 60);
      expect(diffMinutes).toBeGreaterThan(58);
      expect(diffMinutes).toBeLessThan(62);
    });
  });
});
