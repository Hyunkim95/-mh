import React from 'react'
import { formatDuration, getRowBaseTime } from './utils'
import type { HopConfigItem } from '../../store/atoms'

const DELAY_OPTIONS = [
  { label: '10m', minutes: 10 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
] as const

interface HopRowProps {
  index: number
  hop: HopConfigItem
  hops: HopConfigItem[]
  error: string | null
  isCustomOpen: boolean
  onWalletChange: (idx: number, wallet: string) => void
  onWalletBlur: (idx: number, wallet: string) => void
  onDelayChange: (idx: number, minutes: number) => void
  onCustomClick: (idx: number) => void
  onRemove: (idx: number) => void
}

export const HopRow: React.FC<HopRowProps> = ({
  index,
  hop,
  hops,
  error,
  isCustomOpen,
  onWalletChange,
  onWalletBlur,
  onDelayChange,
  onCustomClick,
  onRemove,
}) => {
  const delaySelected = (m: number) => hop.delayMinutes === m
  const base = getRowBaseTime(hops, index)

  const customDurationLabel = (() => {
    if (!hop.scheduledAtUtc) return 'Custom'
    const chosen = new Date(hop.scheduledAtUtc)
    if (isNaN(chosen.getTime())) return 'Custom'
    const diffMin = Math.max(
      0,
      Math.round((chosen.getTime() - base.getTime()) / (60 * 1000))
    )
    return formatDuration(diffMin)
  })()

  return (
    <div className='mb-4 relative'>
      <div className='grid grid-cols-[177px_auto] gap-3 items-center min-w-0'>
        {/* Wallet input */}
        <input
          id={`hop-wallet-${index}`}
          value={hop.wallet ?? ''}
          onChange={e => onWalletChange(index, e.target.value)}
          onBlur={e => onWalletBlur(index, e.target.value)}
          placeholder={`#${index + 1} Enter Wallet`}
          className={`w-full h-[52px] rounded-2xl bg-[var(--dark-jungle-green-500)] border px-5 text-[var(--laser-lemon-500)] not-italic font-medium text-base leading-4 placeholder-[var(--white-100-transparency-24)] outline-none shadow-[inset_0_1px_0_var(--white-100-transparency-06)] ${
            error
              ? 'border-[var(--red-pastel-500)]'
              : 'border-[var(--white-100-transparency-08)]'
          }`}
        />

        {/* Delay options */}
        <div className='flex flex-row items-center gap-3 min-w-0 overflow-x-hidden'>
          {DELAY_OPTIONS.map(opt => (
            <button
              key={`${index}-${opt.label}`}
              type='button'
              onClick={() => onDelayChange(index, opt.minutes)}
              aria-pressed={delaySelected(opt.minutes)}
              className={`w-[52px] h-[52px] rounded-2xl not-italic font-medium text-base leading-4 transition shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] border ${
                delaySelected(opt.minutes)
                  ? 'bg-[var(--laser-lemon-500)] text-black border-[var(--laser-lemon-500)]'
                  : 'bg-[var(--dark-jungle-green-500)] text-[var(--white-100)] border-[var(--white-100-transparency-10)] hover:bg-[var(--dark-gunmetal-500)]'
              }`}
            >
              {opt.label}
            </button>
          ))}

          {/* Custom button */}
          <button
            type='button'
            onClick={() => onCustomClick(index)}
            aria-pressed={!!hop.scheduledAtUtc}
            className={`w-[111px] h-[52px] rounded-2xl not-italic font-medium text-base leading-4 transition ${
              hop.scheduledAtUtc
                ? 'bg-[var(--laser-lemon-500)] text-black border-[var(--laser-lemon-500)]'
                : 'bg-transparent text-[var(--white-100-transparency-60)] hover:text-[var(--white-100-transparency-80)] border border-dashed border-[var(--white-100-transparency-20)]'
            }`}
          >
            {customDurationLabel}
          </button>

          {/* Remove button */}
          <button
            type='button'
            onClick={() => onRemove(index)}
            className='w-[52px] h-[52px] rounded-2xl not-italic font-medium text-base leading-4 transition shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] border border-red-400 text-red-400'
          >
            X
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className='mt-2 text-xs text-[var(--red-pastel-500)]'>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
