/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useDatePicker: vi.fn(),
  useTimezone: vi.fn(),
  useHopStatus: vi.fn(),
  parseUserDateForApi: vi.fn(),
  setUtcValue: vi.fn(),
  onChange: vi.fn(),
  setTimezone: vi.fn(),
  getCommonTimezones: vi.fn(),
}));

vi.mock("react-datepicker", () => ({
  default: ({ onChange, placeholderText, disabled }: any) => (
    <button
      disabled={disabled}
      onClick={() => onChange(new Date("2025-03-01T12:34:00.000Z"))}
      type="button"
    >
      {placeholderText || "open-date-picker"}
    </button>
  ),
}));

vi.mock("../hooks/useTimezone", () => ({
  useDatePicker: mocks.useDatePicker,
  useTimezone: mocks.useTimezone,
  useHopStatus: mocks.useHopStatus,
}));

vi.mock("../utils/timezone", () => ({
  parseUserDateForApi: mocks.parseUserDateForApi,
}));

import {
  HopCountdown,
  TimezoneAwareDateDisplay,
  TimezoneAwareDatePicker,
} from "../components/TimezoneAwareDatePicker";

describe("TimezoneAwareDatePicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseUserDateForApi.mockImplementation(
      (date: Date, timezone: string) => `${date.toISOString()}:${timezone}`
    );
    mocks.useDatePicker.mockReturnValue({
      value: new Date("2025-03-01T10:00:00.000Z"),
      onChange: mocks.onChange,
      setUtcValue: mocks.setUtcValue,
      getUtcValue: () => "2025-03-01T10:00:00.000Z",
      userTimezone: "Europe/Berlin",
      timezoneInfo: {
        abbreviation: "CET",
        offset: "+01:00",
      },
    });
    mocks.getCommonTimezones.mockReturnValue([
      { value: "Europe/Berlin", label: "Berlin", offset: "+01:00" },
      { value: "America/New_York", label: "New York", offset: "-04:00" },
    ]);
    mocks.useTimezone.mockReturnValue({
      setTimezone: mocks.setTimezone,
      getCommonTimezones: mocks.getCommonTimezones,
      timezoneInfo: {
        abbreviation: "CET",
        offset: "+01:00",
      },
      formatForUser: vi.fn(),
      formatHopSchedule: vi.fn(),
      getRelativeTime: vi.fn(),
    });
    mocks.useHopStatus.mockReturnValue({
      status: "scheduled",
      displayTime: "Mar 1, 12:34",
      relativeTime: "in 5 minutes",
      countdown: { formatted: "00:05:00" },
      isOverdue: false,
    });
  });

  it("converts selected dates to UTC and allows timezone changes", () => {
    const onUtcChange = vi.fn();
    const { rerender } = render(
      <TimezoneAwareDatePicker
        onUtcChange={onUtcChange}
        placeholderText="Pick a date"
        utcValue="2025-03-01T10:00:00.000Z"
      />
    );

    expect(screen.getAllByText(/\+01:00/)).toHaveLength(2);
    expect(screen.getAllByText("CET")).toHaveLength(2);
    expect(screen.getByText(/UTC:/)).toHaveTextContent("2025-03-01 10:00:00");

    fireEvent.click(screen.getByRole("button", { name: "Pick a date" }));

    expect(mocks.onChange).toHaveBeenCalledWith(new Date("2025-03-01T12:34:00.000Z"));
    expect(mocks.parseUserDateForApi).toHaveBeenCalledWith(
      new Date("2025-03-01T12:34:00.000Z"),
      "Europe/Berlin"
    );
    expect(onUtcChange).toHaveBeenCalledWith(
      "2025-03-01T12:34:00.000Z:Europe/Berlin"
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "America/New_York" },
    });

    expect(mocks.setTimezone).toHaveBeenCalledWith("America/New_York");

    rerender(
      <TimezoneAwareDatePicker
        onUtcChange={onUtcChange}
        utcValue="2025-03-02T09:00:00.000Z"
      />
    );

    expect(mocks.setUtcValue).toHaveBeenCalledWith("2025-03-02T09:00:00.000Z");
  });

  it("supports inline mode and null selections", () => {
    mocks.useDatePicker.mockReturnValue({
      value: null,
      onChange: mocks.onChange,
      setUtcValue: mocks.setUtcValue,
      getUtcValue: () => null,
      userTimezone: "Europe/Berlin",
      timezoneInfo: {
        abbreviation: "CET",
        offset: "+01:00",
      },
    });

    render(
      <TimezoneAwareDatePicker
        onUtcChange={vi.fn()}
        inlineOnly
        showTimezoneSelector={false}
      />
    );

    expect(screen.queryByText("Change timezone")).not.toBeInTheDocument();
    expect(screen.queryByText("Your timezone:")).not.toBeInTheDocument();
  });
});

describe("TimezoneAwareDateDisplay", () => {
  beforeEach(() => {
    mocks.useTimezone.mockReturnValue({
      formatForUser: vi
        .fn()
        .mockImplementation((value: string | Date, format?: string) =>
          format ? `${format}:${String(value)}` : `full:${String(value)}`
        ),
      formatHopSchedule: vi
        .fn()
        .mockImplementation((value: string | Date) => `schedule:${String(value)}`),
      getRelativeTime: vi
        .fn()
        .mockImplementation((value: string | Date) => `relative:${String(value)}`),
      timezoneInfo: {
        abbreviation: "CET",
        offset: "+01:00",
      },
      setTimezone: mocks.setTimezone,
      getCommonTimezones: mocks.getCommonTimezones,
    });
  });

  it("renders each display format correctly", () => {
    const value = "2025-03-01T10:00:00Z";
    const { rerender } = render(
      <TimezoneAwareDateDisplay utcTimestamp={value} format="full" />
    );

    expect(screen.getByText(`full:${value}`)).toBeInTheDocument();
    expect(screen.getByText("(CET)")).toBeInTheDocument();

    rerender(<TimezoneAwareDateDisplay utcTimestamp={value} format="short" />);
    expect(screen.getByText(`MMM DD, HH:mm:${value}`)).toBeInTheDocument();

    rerender(<TimezoneAwareDateDisplay utcTimestamp={value} format="relative" />);
    expect(screen.getByText(`relative:${value}`)).toBeInTheDocument();
    expect(screen.queryByText("(CET)")).not.toBeInTheDocument();

    rerender(<TimezoneAwareDateDisplay utcTimestamp={value} format="schedule" />);
    expect(screen.getByText(`schedule:${value}`)).toBeInTheDocument();
  });
});

describe("HopCountdown", () => {
  it("renders scheduled, overdue, and completed hop states", () => {
    const { rerender } = render(
      <HopCountdown scheduledAt="2025-03-01T10:00:00Z" />
    );

    expect(screen.getByText("scheduled")).toBeInTheDocument();
    expect(screen.getByText("Mar 1, 12:34")).toBeInTheDocument();
    expect(screen.getByText("In 00:05:00")).toBeInTheDocument();

    mocks.useHopStatus.mockReturnValueOnce({
      status: "overdue",
      displayTime: "Mar 1, 12:34",
      relativeTime: "5 minutes ago",
      countdown: { formatted: "00:05:00 overdue" },
      isOverdue: true,
    });
    rerender(<HopCountdown scheduledAt="2025-03-01T10:00:00Z" />);
    expect(screen.getByText("overdue")).toBeInTheDocument();
    expect(screen.getByText("00:05:00 overdue")).toBeInTheDocument();

    mocks.useHopStatus.mockReturnValueOnce({
      status: "completed",
      displayTime: "Mar 1, 12:34",
      relativeTime: "2 minutes ago",
      countdown: null,
      isOverdue: false,
    });
    rerender(
      <HopCountdown
        scheduledAt="2025-03-01T10:00:00Z"
        executedAt="2025-03-01T10:05:00Z"
      />
    );
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("2 minutes ago")).toBeInTheDocument();
  });
});
