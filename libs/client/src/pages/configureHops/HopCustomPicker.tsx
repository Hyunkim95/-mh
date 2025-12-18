import React, { useRef, useEffect } from 'react'
import { TimezoneAwareDatePicker } from '../../components/TimezoneAwareDatePicker'
import { getRowBaseTime } from './utils'
import type { HopConfigItem } from '../../store/atoms'

interface HopCustomPickerProps {
  index: number
  hops: HopConfigItem[]
  onUtcChange: (idx: number, utcString: string) => void
  onError: (idx: number, errorMsg: string | null) => void
  onClose?: () => void
}

export const HopCustomPicker: React.FC<HopCustomPickerProps> = ({
  index,
  hops,
  onUtcChange,
  onError,
  onClose,
}) => {
  const pickerRef = useRef<HTMLDivElement>(null)
  const base = getRowBaseTime(hops, index)

  const handleDateChange = (utcString: string) => {
    if (!utcString) return

    const chosen = new Date(utcString)
    if (chosen <= base) {
      onError(
        index,
        index === 0 ? 'Time must be in the future' : 'Must be after previous hop'
      )
      return
    }

    onError(index, null)
    onUtcChange(index, utcString)
  }

  // Handle clicking outside the date picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      // Close the picker if clicked outside of it
      if (pickerRef.current && !pickerRef.current.contains(target)) {
        onClose?.()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  return (
    <div className='absolute top-0 z-50 pointer-events-auto' ref={pickerRef}>
      <TimezoneAwareDatePicker
        utcValue={hops[index]?.scheduledAtUtc || ''}
        onUtcChange={handleDateChange}
        showTimeSelect={true}
        minDate={base}
        filterTime={(time) => {
          const sameDay =
            time.getFullYear() === base.getFullYear() &&
            time.getMonth() === base.getMonth() &&
            time.getDate() === base.getDate()
          if (sameDay) {
            return time.getTime() >= base.getTime()
          }
          return time.getTime() > base.getTime()
        }}
        placeholderText='Select date and time'
        showTimezoneSelector={false}
        calendarClassName='mh-datepicker'
        popperClassName='mh-datepicker'
        inlineOnly={true}
      />
    </div>
  )
}
