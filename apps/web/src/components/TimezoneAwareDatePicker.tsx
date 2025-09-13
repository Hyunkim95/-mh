import React from 'react';
import DatePicker from 'react-datepicker';
import { useDatePicker, useTimezone, useHopStatus } from '../hooks/useTimezone';
import { parseUserDateForApi } from '../utils/timezone';
import "react-datepicker/dist/react-datepicker.css";

interface TimezoneAwareDatePickerProps {
  /** UTC timestamp for initial value */
  utcValue?: string | Date | null;
  /** Callback when UTC value changes */
  onUtcChange: (utcIsoString: string | null) => void;
  /** Show time picker */
  showTimeSelect?: boolean;
  /** Minimum date */
  minDate?: Date;
  /** Maximum date */
  maxDate?: Date;
  /** Placeholder text */
  placeholderText?: string;
  /** Date format */
  dateFormat?: string;
  /** Time format */
  timeFormat?: string;
  /** Custom class name */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Show timezone selector */
  showTimezoneSelector?: boolean;
}

export function TimezoneAwareDatePicker({
  utcValue,
  onUtcChange,
  showTimeSelect = true,
  minDate,
  maxDate,
  placeholderText = "Select date and time",
  dateFormat = showTimeSelect ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd",
  timeFormat = "HH:mm",
  className = "",
  disabled = false,
  showTimezoneSelector = true,
}: TimezoneAwareDatePickerProps) {
  const { 
    value, 
    onChange, 
    setUtcValue, 
    getUtcValue, 
    userTimezone, 
    timezoneInfo 
  } = useDatePicker(utcValue || undefined);
  
  const { setTimezone, getCommonTimezones } = useTimezone();

  // Handle date change and notify parent with UTC value
  const handleDateChange = (date: Date | null) => {
    onChange(date);
    // Convert user's local date input to UTC properly
    const utcString = date ? parseUserDateForApi(date, userTimezone) : null;
    onUtcChange(utcString);
  };

  // Handle timezone change
  const handleTimezoneChange = (newTimezone: string) => {
    setTimezone(newTimezone);
  };

  // Update internal value when UTC value prop changes
  React.useEffect(() => {
    if (utcValue !== undefined) {
      setUtcValue(utcValue);
    }
  }, [utcValue, setUtcValue]);

  const commonTimezones = getCommonTimezones();

  return (
    <div className="timezone-aware-datepicker">
      <div className="flex flex-col gap-2">
        {/* Date Picker */}
        <div className="relative">
          <DatePicker
            selected={value}
            onChange={handleDateChange}
            showTimeSelect={showTimeSelect}
            dateFormat={dateFormat}
            timeFormat={timeFormat}
            minDate={minDate}
            maxDate={maxDate}
            placeholderText={placeholderText}
            disabled={disabled}
            className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${className}`}
            calendarClassName="shadow-lg border"
            popperClassName="z-50"
            timeIntervals={15}
            timeCaption="Time"
          />
          
          {/* Timezone indicator */}
          <div className="absolute right-10 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
            {timezoneInfo.abbreviation}
          </div>
        </div>

        {/* Timezone Info */}
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Your timezone: <strong>{timezoneInfo.abbreviation}</strong> ({timezoneInfo.offset})
          </span>
          
          {value && (
            <span className="text-blue-600">
              UTC: {new Date(getUtcValue() || '').toISOString().replace('T', ' ').replace('.000Z', '')}
            </span>
          )}
        </div>

        {/* Timezone Selector */}
        {showTimezoneSelector && (
          <details className="text-sm">
            <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
              Change timezone
            </summary>
            <div className="mt-2 p-3 bg-gray-50 rounded border">
              <select
                value={userTimezone}
                onChange={(e) => handleTimezoneChange(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              >
                {commonTimezones.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label} {tz.offset}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                This only affects the display. Times are stored in UTC.
              </p>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

/**
 * Simple timezone-aware date display component
 */
interface TimezoneAwareDateDisplayProps {
  utcTimestamp: string | Date;
  format?: 'full' | 'short' | 'relative' | 'schedule';
  showTimezone?: boolean;
  className?: string;
}

export function TimezoneAwareDateDisplay({
  utcTimestamp,
  format = 'full',
  showTimezone = true,
  className = ""
}: TimezoneAwareDateDisplayProps) {
  const { formatForUser, formatHopSchedule, getRelativeTime, timezoneInfo } = useTimezone();

  let displayText: string;
  
  switch (format) {
    case 'short':
      displayText = formatForUser(utcTimestamp, 'MMM DD, HH:mm');
      break;
    case 'relative':
      displayText = getRelativeTime(utcTimestamp);
      break;
    case 'schedule':
      displayText = formatHopSchedule(utcTimestamp);
      break;
    case 'full':
    default:
      displayText = formatForUser(utcTimestamp);
      break;
  }

  return (
    <span className={`timezone-aware-display ${className}`}>
      {displayText}
      {showTimezone && format !== 'relative' && format !== 'schedule' && (
        <span className="text-xs text-gray-500 ml-1">
          ({timezoneInfo.abbreviation})
        </span>
      )}
    </span>
  );
}

/**
 * Hop countdown component with real-time updates
 */
interface HopCountdownProps {
  scheduledAt: string | Date;
  executedAt?: string | Date | null;
  className?: string;
  showStatus?: boolean;
}

export function HopCountdown({
  scheduledAt,
  executedAt,
  className = "",
  showStatus = true
}: HopCountdownProps) {
  const hopStatus = useHopStatus({ scheduledAt, executedAt });

  const statusColors: Record<string, string> = {
    completed: 'text-green-600',
    overdue: 'text-red-600',
    scheduled: 'text-blue-600'
  };

  return (
    <div className={`hop-countdown ${className}`}>
      <div className="flex items-center gap-2">
        {showStatus && (
          <span className={`px-2 py-1 text-xs rounded-full font-medium ${
            hopStatus.status === 'completed' 
              ? 'bg-green-100 text-green-800'
              : hopStatus.status === 'overdue'
              ? 'bg-red-100 text-red-800'
              : 'bg-blue-100 text-blue-800'
          }`}>
            {hopStatus.status}
          </span>
        )}
        
        <span className={statusColors[hopStatus.status]}>
          {hopStatus.displayTime}
        </span>
      </div>
      
      <div className="text-sm text-gray-600 mt-1">
        {hopStatus.countdown && !hopStatus.isOverdue && (
          <span>In {hopStatus.countdown.formatted}</span>
        )}
        {hopStatus.isOverdue && (
          <span className="text-red-600">
            {hopStatus.countdown?.formatted}
          </span>
        )}
        {hopStatus.status === 'completed' && (
          <span>{hopStatus.relativeTime}</span>
        )}
      </div>
    </div>
  );
} 