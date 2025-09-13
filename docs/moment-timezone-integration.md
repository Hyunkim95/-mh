# Moment-Timezone Client Integration

## Overview

We've successfully integrated **moment-timezone** into the client-side application to provide robust timezone handling that works seamlessly with the UTC-based backend. This ensures users see times in their local timezone while all data is stored consistently in UTC.

## What's Been Implemented

### 📦 **Dependencies Added**
- `moment-timezone` - Main library for timezone handling
- `@types/moment-timezone` - TypeScript definitions

### 🛠️ **Core Utilities** (`apps/web/src/utils/timezone.ts`)

#### **User Timezone Detection**
```typescript
import { getUserTimezone, getTimezoneInfo } from '../utils/timezone';

const userTz = getUserTimezone(); // e.g., "America/New_York"
const tzInfo = getTimezoneInfo(); // { name, abbreviation, offset, offsetMinutes }
```

#### **UTC ↔ Local Conversion**
```typescript
import { utcToLocal, localToUtc, parseUserDateForApi } from '../utils/timezone';

// Display UTC timestamp in user's timezone
const localTime = utcToLocal('2024-01-15T20:30:00Z');
console.log(localTime.format('YYYY-MM-DD HH:mm z')); // "2024-01-15 15:30 EST"

// Convert user input to UTC for API
const utcString = parseUserDateForApi('2024-01-15 15:30'); // "2024-01-15T20:30:00.000Z"
```

#### **Hop-Specific Utilities**
```typescript
import { 
  formatHopScheduleTime, 
  getTimeUntilHop, 
  isHopOverdue 
} from '../utils/timezone';

// Smart formatting for hop schedules
formatHopScheduleTime('2024-01-15T20:30:00Z'); 
// → "Today at 15:30 (EST)" or "Tomorrow at 15:30 (EST)"

// Real-time countdown
const countdown = getTimeUntilHop('2024-01-15T20:30:00Z');
// → { isPast: false, formatted: "2h 15m", humanized: "in 2 hours" }

// Check if overdue
isHopOverdue('2024-01-15T20:30:00Z'); // → true/false
```

### ⚛️ **React Hooks** (`apps/web/src/hooks/useTimezone.ts`)

#### **Main Timezone Hook**
```typescript
import { useTimezone } from '../hooks/useTimezone';

function MyComponent() {
  const {
    userTimezone,           // "America/New_York"
    timezoneInfo,          // { name, abbreviation, offset, offsetMinutes }
    formatForUser,         // Format UTC for display
    formatHopSchedule,     // Smart hop formatting
    parseForApi,           // Convert user input to UTC
    setTimezone,           // Change timezone
    getCommonTimezones     // Timezone selector options
  } = useTimezone();
}
```

#### **Live Countdown Hook**
```typescript
import { useCountdown } from '../hooks/useTimezone';

function HopTimer({ scheduledAt }: { scheduledAt: string }) {
  const countdown = useCountdown(scheduledAt); // Updates every second
  
  return (
    <div>
      {countdown.isPast ? 'Overdue!' : `In ${countdown.formatted}`}
    </div>
  );
}
```

#### **Hop Status Hook**
```typescript
import { useHopStatus } from '../hooks/useTimezone';

function HopCard({ hop }) {
  const { 
    status,        // 'scheduled' | 'overdue' | 'completed'
    displayTime,   // "Today at 15:30 (EST)"
    relativeTime,  // "in 2 hours" or "5 minutes ago"
    countdown,     // Live countdown object
    isOverdue      // boolean
  } = useHopStatus(hop);
}
```

#### **Date Picker Hook**
```typescript
import { useDatePicker } from '../hooks/useTimezone';

function ScheduleForm({ initialUtcValue }) {
  const {
    value,          // Local Date object for picker
    onChange,       // Handle date changes
    getUtcValue,    // Get UTC string for API
    setUtcValue,    // Set from UTC timestamp
    userTimezone,   // Current timezone
    timezoneInfo    // Timezone details
  } = useDatePicker(initialUtcValue);
}
```

### 🎨 **React Components** (`apps/web/src/components/TimezoneAwareDatePicker.tsx`)

#### **Timezone-Aware Date Picker**
```typescript
import { TimezoneAwareDatePicker } from '../components/TimezoneAwareDatePicker';

function ScheduleHop() {
  const [scheduledTime, setScheduledTime] = useState<string | null>(null);
  
  return (
    <TimezoneAwareDatePicker
      utcValue={scheduledTime}
      onUtcChange={setScheduledTime}  // Receives UTC ISO string
      showTimeSelect={true}
      minDate={new Date()}
      showTimezoneSelector={true}
    />
  );
}
```

#### **Date Display Components**
```typescript
import { 
  TimezoneAwareDateDisplay, 
  HopCountdown 
} from '../components/TimezoneAwareDatePicker';

// Smart date display
<TimezoneAwareDateDisplay 
  utcTimestamp="2024-01-15T20:30:00Z"
  format="schedule"  // 'full' | 'short' | 'relative' | 'schedule'
  showTimezone={true}
/>

// Real-time hop countdown
<HopCountdown
  scheduledAt="2024-01-15T20:30:00Z"
  executedAt={null}
  showStatus={true}
/>
```

## Key Features

### ✅ **Automatic Timezone Detection**
- Detects user's system timezone using `moment.tz.guess()`
- Falls back gracefully if detection fails
- Updates when user changes system timezone

### ✅ **Smart Date Formatting**
- **Today**: "Today at 15:30 (EST)"
- **Tomorrow**: "Tomorrow at 15:30 (EST)" 
- **This Week**: "Wednesday at 15:30 (EST)"
- **Future**: "Jan 15, 2024 at 15:30 (EST)"

### ✅ **Real-Time Countdowns**
- Updates every second
- Shows "In 2h 15m" format
- Handles overdue states
- Displays relative time ("5 minutes ago")

### ✅ **Timezone Selector**
- Common timezones with abbreviations and offsets
- Easy switching between timezones
- Visual feedback for timezone changes

### ✅ **UTC API Integration**
- All user input automatically converted to UTC
- All API responses displayed in user's timezone
- Seamless integration with existing backend

## Usage Examples

### **Basic Hop Scheduling**
```typescript
function CreateHop() {
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const { parseForApi } = useTimezone();
  
  const handleSubmit = async () => {
    const hopData = {
      recipient: '...',
      scheduledAt: scheduledAt, // Already in UTC ISO format
    };
    
    await createHop(hopData);
  };
  
  return (
    <TimezoneAwareDatePicker
      utcValue={scheduledAt}
      onUtcChange={setScheduledAt}
      minDate={new Date()}
    />
  );
}
```

### **Hop List Display**
```typescript
function HopList({ hops }) {
  return (
    <div>
      {hops.map(hop => (
        <div key={hop.id} className="hop-card">
          <h3>{hop.recipient}</h3>
          
          <HopCountdown
            scheduledAt={hop.scheduledAt}
            executedAt={hop.executedAt}
          />
          
          <div className="details">
            <TimezoneAwareDateDisplay 
              utcTimestamp={hop.scheduledAt}
              format="full"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
```

### **Quick Scheduling**
```typescript
function QuickSchedule() {
  const { scheduleFromNow } = useTimezone();
  
  const handleQuickSchedule = (minutes: number) => {
    const scheduled = scheduleFromNow(minutes);
    
    console.log('UTC for API:', scheduled.utcIsoString);
    console.log('Display for user:', scheduled.localDisplay);
    console.log('Relative time:', scheduled.relativeTime);
  };
  
  return (
    <div>
      <button onClick={() => handleQuickSchedule(15)}>
        In 15 minutes
      </button>
      <button onClick={() => handleQuickSchedule(60)}>
        In 1 hour
      </button>
    </div>
  );
}
```

## Integration with Existing Components

### **Updating Route Creation Form**
Replace the existing date picker with:
```typescript
// Before
<DatePicker
  selected={scheduledDate}
  onChange={setScheduledDate}
  showTimeSelect
/>

// After
<TimezoneAwareDatePicker
  utcValue={scheduledDate}
  onUtcChange={setScheduledDate}  // Now receives UTC string
  showTimeSelect={true}
/>
```

### **Updating Hop Display**
Replace manual date formatting with:
```typescript
// Before
<span>{new Date(hop.scheduledAt).toLocaleString()}</span>

// After
<TimezoneAwareDateDisplay 
  utcTimestamp={hop.scheduledAt}
  format="schedule"
/>
```

## Benefits

### 🌍 **Global User Support**
- Works correctly for users in any timezone
- Handles daylight saving time automatically
- Consistent experience across regions

### 🔄 **Seamless Backend Integration**
- All data stored in UTC (no backend changes needed)
- Automatic conversion for API calls
- Compatible with existing timezone fix

### ⚡ **Real-Time Updates**
- Live countdowns for pending hops
- Automatic status updates
- Responsive to timezone changes

### 🎨 **Great UX**
- Smart, contextual date formatting
- Timezone selector when needed
- Clear UTC indication for transparency

## Migration Guide

1. **Replace existing date pickers**:
   ```typescript
   // Old
   <DatePicker onChange={setDate} />
   
   // New
   <TimezoneAwareDatePicker onUtcChange={setDate} />
   ```

2. **Update date displays**:
   ```typescript
   // Old
   {new Date(timestamp).toLocaleString()}
   
   // New
   <TimezoneAwareDateDisplay utcTimestamp={timestamp} />
   ```

3. **Add real-time features**:
   ```typescript
   // Add countdown timers
   <HopCountdown scheduledAt={hop.scheduledAt} executedAt={hop.executedAt} />
   ```

The moment-timezone integration is now complete and ready to provide a superior timezone experience for all users! 🎉 