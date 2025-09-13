/**
 * Timezone utilities for consistent UTC handling
 * All scheduling and time comparisons should use these functions
 */

/**
 * Get current UTC timestamp
 * Use this instead of new Date() for database operations
 */
export function utcNow(): Date {
  return new Date();
}

/**
 * Convert any date to UTC
 * Ensures the date is treated as UTC regardless of input timezone
 */
export function toUtc(date: Date | string): Date {
  if (typeof date === 'string') {
    // If string doesn't include timezone info, treat as UTC
    if (!date.includes('T') || (!date.includes('+') && !date.includes('Z'))) {
      return new Date(date + 'Z');
    }
    return new Date(date);
  }
  return new Date(date.getTime());
}

/**
 * Create a UTC date from components
 * Useful for scheduling hops at specific times
 */
export function createUtcDate(
  year: number,
  month: number, // 0-based (0 = January)
  day: number,
  hours: number = 0,
  minutes: number = 0,
  seconds: number = 0
): Date {
  return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
}

/**
 * Add time to a date and return UTC
 */
export function addTime(
  date: Date,
  options: {
    years?: number;
    months?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
  }
): Date {
  const result = new Date(date.getTime());
  
  if (options.years) result.setUTCFullYear(result.getUTCFullYear() + options.years);
  if (options.months) result.setUTCMonth(result.getUTCMonth() + options.months);
  if (options.days) result.setUTCDate(result.getUTCDate() + options.days);
  if (options.hours) result.setUTCHours(result.getUTCHours() + options.hours);
  if (options.minutes) result.setUTCMinutes(result.getUTCMinutes() + options.minutes);
  if (options.seconds) result.setUTCSeconds(result.getUTCSeconds() + options.seconds);
  if (options.milliseconds) result.setUTCMilliseconds(result.getUTCMilliseconds() + options.milliseconds);
  
  return result;
}

/**
 * Check if a date is in the past (compared to UTC now)
 */
export function isInPast(date: Date): boolean {
  return date.getTime() < utcNow().getTime();
}

/**
 * Check if a date is in the future (compared to UTC now)
 */
export function isInFuture(date: Date): boolean {
  return date.getTime() > utcNow().getTime();
}

/**
 * Get time difference in milliseconds
 */
export function timeDifference(date1: Date, date2: Date): number {
  return date1.getTime() - date2.getTime();
}

/**
 * Format date as ISO string in UTC
 */
export function toIsoString(date: Date): string {
  return date.toISOString();
}

/**
 * Parse ISO string and ensure it's treated as UTC
 */
export function fromIsoString(isoString: string): Date {
  return toUtc(isoString);
}

/**
 * Schedule a hop execution time based on delay from now
 * @param delayMinutes Minutes from now when hop should execute
 */
export function scheduleHopExecution(delayMinutes: number): Date {
  return addTime(utcNow(), { minutes: delayMinutes });
}

/**
 * Check if a hop is overdue for execution
 */
export function isHopOverdue(scheduledAt: Date, currentTime?: Date): boolean {
  const now = currentTime || utcNow();
  return scheduledAt.getTime() <= now.getTime();
}

/**
 * Get minutes until a scheduled time
 */
export function minutesUntilScheduled(scheduledAt: Date, currentTime?: Date): number {
  const now = currentTime || utcNow();
  const diff = scheduledAt.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60)); // Convert to minutes and round up
}

/**
 * Validate that a date is a valid UTC timestamp
 */
export function isValidUtcDate(date: any): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Convert user input to UTC date
 * Handles various input formats and ensures UTC output
 */
export function parseUserDateToUtc(input: string | Date | number): Date {
  let date: Date;
  
  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'number') {
    date = new Date(input);
  } else {
    // String input - try to parse
    date = new Date(input);
  }
  
  if (!isValidUtcDate(date)) {
    throw new Error(`Invalid date input: ${input}`);
  }
  
  return toUtc(date);
} 