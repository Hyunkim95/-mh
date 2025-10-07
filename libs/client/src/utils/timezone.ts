import moment from 'moment-timezone';

/**
 * Client-side timezone utilities using moment-timezone
 * These utilities help with displaying and converting timestamps for users
 */

/**
 * Get the user's current timezone
 */
export function getUserTimezone(): string {
  return moment.tz.guess();
}

/**
 * Convert a UTC timestamp to the user's local timezone
 * @param utcTimestamp - UTC timestamp (ISO string or Date)
 * @param timezone - Optional specific timezone, defaults to user's timezone
 */
export function utcToLocal(utcTimestamp: string | Date, timezone?: string): moment.Moment {
  const tz = timezone || getUserTimezone();
  return moment.utc(utcTimestamp).tz(tz);
}

/**
 * Convert a local timestamp to UTC
 * @param localTimestamp - Local timestamp (ISO string or Date)
 * @param timezone - Optional specific timezone, defaults to user's timezone
 */
export function localToUtc(localTimestamp: string | Date, timezone?: string): moment.Moment {
  const tz = timezone || getUserTimezone();
  return moment.tz(localTimestamp, tz).utc();
}

/**
 * Format a UTC timestamp for display in the user's timezone
 * @param utcTimestamp - UTC timestamp (ISO string or Date)
 * @param format - Moment.js format string (default: 'YYYY-MM-DD HH:mm:ss z')
 * @param timezone - Optional specific timezone, defaults to user's timezone
 */
export function formatTimestampForUser(
  utcTimestamp: string | Date,
  format: string = 'YYYY-MM-DD HH:mm:ss z',
  timezone?: string
): string {
  return utcToLocal(utcTimestamp, timezone).format(format);
}

/**
 * Format a timestamp for hop scheduling display
 * @param utcTimestamp - UTC timestamp (ISO string or Date)
 * @param timezone - Optional specific timezone, defaults to user's timezone
 */
export function formatHopScheduleTime(utcTimestamp: string | Date, timezone?: string): string {
  const localTime = utcToLocal(utcTimestamp, timezone);
  const now = moment();
  
  // If it's today, show time with "Today"
  if (localTime.isSame(now, 'day')) {
    return `Today at ${localTime.format('HH:mm')} (${localTime.format('z')})`;
  }
  
  // If it's tomorrow, show "Tomorrow"
  if (localTime.isSame(now.clone().add(1, 'day'), 'day')) {
    return `Tomorrow at ${localTime.format('HH:mm')} (${localTime.format('z')})`;
  }
  
  // If it's within a week, show day name
  if (localTime.isBetween(now, now.clone().add(7, 'days'))) {
    return localTime.format('dddd [at] HH:mm (z)');
  }
  
  // Otherwise, show full date
  return localTime.format('MMM DD, YYYY [at] HH:mm (z)');
}

/**
 * Get relative time from now (e.g., "in 5 minutes", "2 hours ago")
 * @param utcTimestamp - UTC timestamp (ISO string or Date)
 * @param timezone - Optional specific timezone, defaults to user's timezone
 */
export function getRelativeTime(utcTimestamp: string | Date, timezone?: string): string {
  return utcToLocal(utcTimestamp, timezone).fromNow();
}

/**
 * Check if a hop is overdue (scheduled time has passed)
 * @param scheduledAtUtc - Scheduled UTC timestamp (ISO string or Date)
 */
export function isHopOverdue(scheduledAtUtc: string | Date): boolean {
  return moment.utc(scheduledAtUtc).isBefore(moment.utc());
}

/**
 * Get time until a scheduled hop
 * @param scheduledAtUtc - Scheduled UTC timestamp (ISO string or Date)
 * @returns Object with time components and formatted string
 */
export function getTimeUntilHop(scheduledAtUtc: string | Date): {
  isPast: boolean;
  duration: moment.Duration;
  formatted: string;
  humanized: string;
} {
  const scheduled = moment.utc(scheduledAtUtc);
  const now = moment.utc();
  const duration = moment.duration(scheduled.diff(now));
  const isPast = duration.asMilliseconds() < 0;
  
  let formatted: string;
  let humanized: string;
  
  if (isPast) {
    const pastDuration = moment.duration(now.diff(scheduled));
    formatted = `Overdue by ${pastDuration.humanize()}`;
    humanized = `${pastDuration.humanize()} ago`;
  } else {
    const days = Math.floor(duration.asDays());
    const hours = duration.hours();
    const minutes = duration.minutes();
    
    if (days > 0) {
      formatted = `${days}d ${hours}h ${minutes}m`;
      humanized = duration.humanize();
    } else if (hours > 0) {
      formatted = `${hours}h ${minutes}m`;
      humanized = duration.humanize();
    } else {
      formatted = `${minutes}m`;
      humanized = duration.humanize();
    }
  }
  
  return {
    isPast,
    duration: isPast ? moment.duration(now.diff(scheduled)) : duration,
    formatted,
    humanized
  };
}

/**
 * Parse user input date and convert to UTC for API submission
 * @param userInput - User's date input (string or Date)
 * @param timezone - Optional specific timezone, defaults to user's timezone
 */
export function parseUserDateForApi(userInput: string | Date, timezone?: string): string {
  return localToUtc(userInput, timezone).toISOString();
}

/**
 * Create a date picker compatible date from UTC timestamp
 * @param utcTimestamp - UTC timestamp (ISO string or Date)
 * @param timezone - Optional specific timezone, defaults to user's timezone
 */
export function utcToDatePickerValue(utcTimestamp: string | Date, timezone?: string): Date {
  return utcToLocal(utcTimestamp, timezone).toDate();
}

/**
 * Get timezone info for display
 * @param timezone - Optional specific timezone, defaults to user's timezone
 */
export function getTimezoneInfo(timezone?: string): {
  name: string;
  abbreviation: string;
  offset: string;
  offsetMinutes: number;
} {
  const tz = timezone || getUserTimezone();
  const now = moment.tz(tz);
  
  return {
    name: tz,
    abbreviation: now.format('z'),
    offset: now.format('Z'),
    offsetMinutes: now.utcOffset()
  };
}

/**
 * Validate that a date string can be parsed
 */
export function isValidDateString(dateString: string): boolean {
  return moment(dateString).isValid();
}

/**
 * Get common timezone options for dropdowns
 */
export function getCommonTimezones(): Array<{ value: string; label: string; offset: string }> {
  const commonTzs = [
    'America/New_York',
    'America/Chicago', 
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Australia/Sydney',
    'UTC'
  ];
  
  return commonTzs.map(tz => {
    const m = moment.tz(tz);
    return {
      value: tz,
      label: `${tz.replace('_', ' ')} (${m.format('z')})`,
      offset: m.format('Z')
    };
  });
}

/**
 * Schedule a hop with user-friendly date input
 * @param delayMinutes - Minutes from now
 * @param timezone - Optional specific timezone, defaults to user's timezone
 */
export function scheduleHopFromNow(delayMinutes: number, timezone?: string): {
  utcIsoString: string;
  localDisplay: string;
  relativeTime: string;
} {
  const tz = timezone || getUserTimezone();
  const scheduledTime = moment.tz(tz).add(delayMinutes, 'minutes');
  const utcTime = scheduledTime.utc();
  
  return {
    utcIsoString: utcTime.toISOString(),
    localDisplay: scheduledTime.format('YYYY-MM-DD HH:mm:ss z'),
    relativeTime: scheduledTime.fromNow()
  };
} 