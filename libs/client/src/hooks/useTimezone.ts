import { useState, useEffect } from "react";
import moment from "moment-timezone";
import {
  getUserTimezone,
  formatTimestampForUser,
  formatHopScheduleTime,
  getRelativeTime,
  isHopOverdue,
  getTimeUntilHop,
  parseUserDateForApi,
  utcToDatePickerValue,
  getTimezoneInfo,
  getCommonTimezones,
  scheduleHopFromNow,
} from "../utils/timezone";

/**
 * React hook for timezone utilities and user timezone management
 */
export function useTimezone() {
  const [userTimezone, setUserTimezone] = useState<string>(() =>
    getUserTimezone()
  );
  const [timezoneInfo, setTimezoneInfo] = useState(() =>
    getTimezoneInfo(userTimezone)
  );

  // Update timezone info when timezone changes
  useEffect(() => {
    setTimezoneInfo(getTimezoneInfo(userTimezone));
  }, [userTimezone]);

  // Refresh timezone detection (useful after user changes system timezone)
  const refreshTimezone = () => {
    const newTimezone = getUserTimezone();
    setUserTimezone(newTimezone);
  };

  // Set a specific timezone (useful for timezone selector)
  const setTimezone = (timezone: string) => {
    if (moment.tz.zone(timezone)) {
      setUserTimezone(timezone);
    } else {
      console.warn(`Invalid timezone: ${timezone}`);
    }
  };

  return {
    // Current timezone info
    userTimezone,
    timezoneInfo,

    // Timezone management
    setTimezone,
    refreshTimezone,

    // Formatting utilities (bound to current timezone)
    formatForUser: (utcTimestamp: string | Date, format?: string) =>
      formatTimestampForUser(utcTimestamp, format, userTimezone),

    formatHopSchedule: (utcTimestamp: string | Date) =>
      formatHopScheduleTime(utcTimestamp, userTimezone),

    getRelativeTime: (utcTimestamp: string | Date) =>
      getRelativeTime(utcTimestamp, userTimezone),

    // Hop-specific utilities
    isHopOverdue,
    getTimeUntilHop,

    // API utilities
    parseForApi: (userInput: string | Date) =>
      parseUserDateForApi(userInput, userTimezone),

    utcToDatePicker: (utcTimestamp: string | Date) =>
      utcToDatePickerValue(utcTimestamp, userTimezone),

    scheduleFromNow: (delayMinutes: number) =>
      scheduleHopFromNow(delayMinutes, userTimezone),

    // Utility functions
    getCommonTimezones,
  };
}

/**
 * Hook for live countdown to a scheduled time
 * Updates every second to show real-time countdown
 */
export function useCountdown(scheduledAtUtc: string | Date) {
  const [timeInfo, setTimeInfo] = useState(() =>
    getTimeUntilHop(scheduledAtUtc)
  );

  useEffect(() => {
    const updateCountdown = () => {
      setTimeInfo(getTimeUntilHop(scheduledAtUtc));
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [scheduledAtUtc]);

  return timeInfo;
}

/**
 * Hook for displaying hop status with real-time updates
 */
export function useHopStatus(hop: {
  scheduledAt: string | Date;
  executedAt?: string | Date | null;
}) {
  const { formatHopSchedule, getRelativeTime } = useTimezone();
  const countdown = useCountdown(hop.scheduledAt);

  const status = hop.executedAt
    ? "completed"
    : countdown.isPast
    ? "overdue"
    : "scheduled";

  const displayTime = hop.executedAt
    ? formatHopSchedule(hop.executedAt)
    : formatHopSchedule(hop.scheduledAt);

  const relativeTime = hop.executedAt
    ? getRelativeTime(hop.executedAt)
    : countdown.humanized;

  return {
    status,
    displayTime,
    relativeTime,
    countdown: status === "scheduled" ? countdown : null,
    isOverdue: countdown.isPast && !hop.executedAt,
  };
}

/**
 * Hook for timezone-aware date picker
 */
export function useDatePicker(initialUtcValue?: string | Date) {
  const { utcToDatePicker, parseForApi, userTimezone, timezoneInfo } =
    useTimezone();
  const [localValue, setLocalValue] = useState<Date | null>(
    initialUtcValue ? utcToDatePicker(initialUtcValue) : null
  );

  const setUtcValue = (utcTimestamp: string | Date | null) => {
    setLocalValue(utcTimestamp ? utcToDatePicker(utcTimestamp) : null);
  };

  const getUtcValue = (): string | null => {
    return localValue ? parseForApi(localValue) : null;
  };

  const handleDateChange = (date: Date | null) => {
    setLocalValue(date);
  };

  return {
    // Date picker props
    value: localValue,
    onChange: handleDateChange,

    // Utility methods
    setUtcValue,
    getUtcValue,

    // Timezone context
    userTimezone,
    timezoneInfo,
  };
}
