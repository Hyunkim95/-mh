/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  zone: vi.fn(),
  getUserTimezone: vi.fn(),
  formatTimestampForUser: vi.fn(),
  formatHopScheduleTime: vi.fn(),
  getRelativeTime: vi.fn(),
  isHopOverdue: vi.fn(),
  getTimeUntilHop: vi.fn(),
  parseUserDateForApi: vi.fn(),
  utcToDatePickerValue: vi.fn(),
  getTimezoneInfo: vi.fn(),
  getCommonTimezones: vi.fn(),
  scheduleHopFromNow: vi.fn(),
}));

vi.mock("moment-timezone", () => ({
  default: {
    tz: {
      zone: mocks.zone,
    },
  },
}));

vi.mock("../utils/timezone", () => ({
  getUserTimezone: mocks.getUserTimezone,
  formatTimestampForUser: mocks.formatTimestampForUser,
  formatHopScheduleTime: mocks.formatHopScheduleTime,
  getRelativeTime: mocks.getRelativeTime,
  isHopOverdue: mocks.isHopOverdue,
  getTimeUntilHop: mocks.getTimeUntilHop,
  parseUserDateForApi: mocks.parseUserDateForApi,
  utcToDatePickerValue: mocks.utcToDatePickerValue,
  getTimezoneInfo: mocks.getTimezoneInfo,
  getCommonTimezones: mocks.getCommonTimezones,
  scheduleHopFromNow: mocks.scheduleHopFromNow,
}));

import {
  useCountdown,
  useDatePicker,
  useHopStatus,
  useTimezone,
} from "../hooks/useTimezone";

describe("useTimezone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserTimezone.mockReturnValue("Europe/Berlin");
    mocks.getTimezoneInfo.mockImplementation((tz: string) => ({
      abbreviation: tz === "America/New_York" ? "EDT" : "CEST",
      offset: tz === "America/New_York" ? "-04:00" : "+02:00",
    }));
    mocks.getCommonTimezones.mockReturnValue([
      {
        value: "Europe/Berlin",
        label: "Berlin",
        offset: "+02:00",
      },
    ]);
    mocks.formatTimestampForUser.mockImplementation(
      (value: string | Date, format?: string, tz?: string) =>
        `formatted:${String(value)}:${format ?? "default"}:${tz ?? "none"}`
    );
    mocks.formatHopScheduleTime.mockImplementation(
      (value: string | Date, tz?: string) => `schedule:${String(value)}:${tz}`
    );
    mocks.getRelativeTime.mockImplementation(
      (value: string | Date, tz?: string) => `relative:${String(value)}:${tz}`
    );
    mocks.parseUserDateForApi.mockImplementation(
      (value: string | Date, tz?: string) => `api:${String(value)}:${tz}`
    );
    const dateValue = new Date("2025-03-01T10:00:00.000Z");
    mocks.utcToDatePickerValue.mockReturnValue(dateValue);
    mocks.scheduleHopFromNow.mockImplementation(
      (delay: number, tz?: string) => `scheduled:${delay}:${tz}`
    );
    mocks.isHopOverdue.mockReturnValue(false);
    mocks.zone.mockImplementation((tz: string) => (tz === "Invalid/TZ" ? null : {}));
    mocks.getTimeUntilHop.mockReturnValue({
      isPast: false,
      formatted: "in 3h",
      humanized: "in three hours",
    });
  });

  it("binds timezone helpers to the detected timezone and refreshes state", () => {
    const { result } = renderHook(() => useTimezone());

    expect(result.current.userTimezone).toBe("Europe/Berlin");
    expect(result.current.timezoneInfo).toEqual({
      abbreviation: "CEST",
      offset: "+02:00",
    });
    expect(result.current.formatForUser("2025-03-01T10:00:00Z", "short")).toBe(
      "formatted:2025-03-01T10:00:00Z:short:Europe/Berlin"
    );
    expect(result.current.formatHopSchedule("2025-03-01T10:00:00Z")).toBe(
      "schedule:2025-03-01T10:00:00Z:Europe/Berlin"
    );
    expect(result.current.getRelativeTime("2025-03-01T10:00:00Z")).toBe(
      "relative:2025-03-01T10:00:00Z:Europe/Berlin"
    );
    expect(result.current.parseForApi("2025-03-01T10:00:00Z")).toBe(
      "api:2025-03-01T10:00:00Z:Europe/Berlin"
    );
    expect(result.current.utcToDatePicker("2025-03-01T10:00:00Z")).toBe(
      mocks.utcToDatePickerValue.mock.results[0]?.value
    );
    expect(result.current.scheduleFromNow(15)).toBe(
      "scheduled:15:Europe/Berlin"
    );
    expect(result.current.getCommonTimezones()).toHaveLength(1);

    mocks.getUserTimezone.mockReturnValue("America/New_York");

    act(() => {
      result.current.refreshTimezone();
    });

    expect(result.current.userTimezone).toBe("America/New_York");
    expect(result.current.timezoneInfo).toEqual({
      abbreviation: "EDT",
      offset: "-04:00",
    });
  });

  it("updates timezone only when the selection is valid", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useTimezone());

    act(() => {
      result.current.setTimezone("America/New_York");
    });

    expect(result.current.userTimezone).toBe("America/New_York");

    act(() => {
      result.current.setTimezone("Invalid/TZ");
    });

    expect(result.current.userTimezone).toBe("America/New_York");
    expect(warnSpy).toHaveBeenCalledWith("Invalid timezone: Invalid/TZ");

    warnSpy.mockRestore();
  });
});

describe("useCountdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTimeUntilHop
      .mockReturnValueOnce({
        isPast: false,
        formatted: "in 5m",
        humanized: "in five minutes",
      })
      .mockReturnValueOnce({
        isPast: false,
        formatted: "in 4m",
        humanized: "in four minutes",
      })
      .mockReturnValue({
        isPast: true,
        formatted: "4m overdue",
        humanized: "four minutes ago",
      });
  });

  it("updates the countdown on an interval", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() =>
      useCountdown("2025-03-01T10:00:00Z")
    );

    expect(result.current.formatted).toBe("in 4m");

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.formatted).toBe("4m overdue");

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.formatted).toBe("4m overdue");
    unmount();
    vi.useRealTimers();
  });
});

describe("useHopStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserTimezone.mockReturnValue("Europe/Berlin");
    mocks.getTimezoneInfo.mockReturnValue({
      abbreviation: "CEST",
      offset: "+02:00",
    });
    mocks.formatHopScheduleTime.mockImplementation(
      (value: string | Date) => `schedule:${String(value)}`
    );
    mocks.getRelativeTime.mockImplementation(
      (value: string | Date) => `relative:${String(value)}`
    );
  });

  it("returns completed state for executed hops", () => {
    mocks.getTimeUntilHop.mockReturnValue({
      isPast: false,
      formatted: "ignored",
      humanized: "ignored",
    });

    const { result } = renderHook(() =>
      useHopStatus({
        scheduledAt: "2025-03-01T10:00:00Z",
        executedAt: "2025-03-01T11:00:00Z",
      })
    );

    expect(result.current.status).toBe("completed");
    expect(result.current.displayTime).toBe("schedule:2025-03-01T11:00:00Z");
    expect(result.current.relativeTime).toBe("relative:2025-03-01T11:00:00Z");
    expect(result.current.countdown).toBeNull();
    expect(result.current.isOverdue).toBe(false);
  });

  it("returns overdue and scheduled states based on countdown", () => {
    mocks.getTimeUntilHop.mockReturnValue({
      isPast: true,
      formatted: "3m overdue",
      humanized: "three minutes ago",
    });
    const overdue = renderHook(() =>
      useHopStatus({ scheduledAt: "2025-03-01T10:00:00Z" })
    );
    expect(overdue.result.current.status).toBe("overdue");
    expect(overdue.result.current.isOverdue).toBe(true);

    mocks.getTimeUntilHop.mockReset();
    mocks.getTimeUntilHop.mockReturnValue({
      isPast: false,
      formatted: "in 2m",
      humanized: "in two minutes",
    });
    const scheduled = renderHook(() =>
      useHopStatus({ scheduledAt: "2025-03-01T10:00:00Z" })
    );
    expect(scheduled.result.current.status).toBe("scheduled");
    expect(scheduled.result.current.countdown?.formatted).toBe("in 2m");
    expect(scheduled.result.current.relativeTime).toBe("in two minutes");
  });
});

describe("useDatePicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserTimezone.mockReturnValue("Europe/Berlin");
    mocks.getTimezoneInfo.mockReturnValue({
      abbreviation: "CEST",
      offset: "+02:00",
    });
    mocks.utcToDatePickerValue.mockImplementation(
      () => new Date("2025-03-01T10:00:00.000Z")
    );
    mocks.parseUserDateForApi.mockImplementation(
      (value: string | Date, tz?: string) => `api:${String(value)}:${tz}`
    );
  });

  it("manages local picker state and exposes UTC conversions", () => {
    const { result } = renderHook(() =>
      useDatePicker("2025-03-01T10:00:00Z")
    );

    expect(result.current.value).toEqual(new Date("2025-03-01T10:00:00.000Z"));
    expect(result.current.getUtcValue()).toContain("api:");

    act(() => {
      result.current.onChange(new Date("2025-03-02T12:00:00.000Z"));
    });

    expect(result.current.value).toEqual(new Date("2025-03-02T12:00:00.000Z"));

    act(() => {
      result.current.setUtcValue(null);
    });

    expect(result.current.value).toBeNull();
    expect(result.current.getUtcValue()).toBeNull();
  });
});
