import React, { useState } from 'react'
import {
  TimestampRouteInput,
  TimestampHopInput,
  convertTimestampToRouteInput,
  InitializeRouteInput,
} from '../../types/route'
import {
  TimezoneAwareDatePicker,
  TimezoneAwareDateDisplay,
} from '../TimezoneAwareDatePicker'
import { useTimezone } from '../../hooks/useTimezone'
import { TokenSelector } from '../TokenSelector'

export interface AdminRouteCreateFormProps {
  type: 'SPL' | 'SOL'
  isLoading?: boolean
  error?: string
  onSubmit: (route: any) => void
}

const inputBase =
  'w-full h-[52px] rounded-2xl bg-[var(--chinese-black-500)] border px-5 text-white placeholder-[var(--white-100-transparency-30)] outline-none shadow-[inset_0_1px_0_var(--white-100-transparency-06)] border-[var(--white-100-transparency-10)]'
const labelBase =
  'not-italic font-medium text-base leading-4 text-[var(--white-100)] mb-2'

export const AdminRouteCreateForm: React.FC<AdminRouteCreateFormProps> = ({
  type,
  isLoading = false,
  error,
  onSubmit,
}) => {
  const [detectedDecimals, setDetectedDecimals] = useState<number>(
    type === 'SOL' ? 9 : 6
  )
  const { scheduleFromNow } = useTimezone()
  const [isCreatingRoute, setIsCreatingRoute] = useState(false)
  const [createRouteError, setCreateRouteError] = useState<string | null>(null)

  const getDefaultScheduledTime = (minutesFromNow: number = 5) => {
    return scheduleFromNow(minutesFromNow).utcIsoString
  }

  const [timestampRoute, setTimestampRoute] = useState<TimestampRouteInput>({
    hopAmountTokens: '0.1',
    splMint: type === 'SPL' ? '' : undefined,
    hops: [{ recipient: '', scheduledAt: new Date().toISOString() }],
  })

  const handleTokenChange = (tokenMint: string, tokenDecimals: number) => {
    setTimestampRoute(prev => ({ ...prev, splMint: tokenMint }))
    setDetectedDecimals(tokenDecimals)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const routeWithCurrentTime = {
        ...timestampRoute,
        hops: timestampRoute.hops.map((hop, index) =>
          index === 0 ? { ...hop, scheduledAt: new Date().toISOString() } : hop
        ),
      }
      const internalRouteInput: InitializeRouteInput =
        convertTimestampToRouteInput(routeWithCurrentTime, detectedDecimals)
      const routeData = {
        tokenType: type,
        tokenMint: internalRouteInput.splMint,
        tokenDecimals: detectedDecimals,
        tokenSymbol: undefined, // Admin form doesn't have symbol info
        hopAmountTokens: timestampRoute.hopAmountTokens,
        hopAmountRaw: internalRouteInput.hopAmount,
        hops: routeWithCurrentTime.hops.map(hop => ({
          recipient: hop.recipient,
          scheduledAt: hop.scheduledAt,
        })),
      }
      setIsCreatingRoute(true)
      setCreateRouteError(null)
      onSubmit(routeData)
    } catch (err) {
      setCreateRouteError(
        err instanceof Error ? err.message : 'Failed to create route'
      )
    } finally {
      setIsCreatingRoute(false)
    }
  }

  const updateHop = (
    index: number,
    field: keyof TimestampHopInput,
    value: string | Date
  ) => {
    if (index === 0 && field === 'scheduledAt') return
    setTimestampRoute(prev => ({
      ...prev,
      hops: prev.hops.map((hop, i) =>
        i === index ? { ...hop, [field]: value } : hop
      ),
    }))
  }

  const addHop = () => {
    const lastHop = timestampRoute.hops[timestampRoute.hops.length - 1]
    const lastHopTime = new Date(lastHop.scheduledAt).getTime()
    const nextScheduledTime = new Date(
      lastHopTime + 30 * 60 * 1000
    ).toISOString()
    setTimestampRoute(prev => ({
      ...prev,
      hops: [...prev.hops, { recipient: '', scheduledAt: nextScheduledTime }],
    }))
  }

  const removeHop = (index: number) => {
    setTimestampRoute(prev => ({
      ...prev,
      hops: prev.hops.filter((_, i) => i !== index),
    }))
  }

  const calculateDelay = (currentIndex: number): string => {
    if (currentIndex === 0) return 'Executes now (when deployed)'
    const currentTime = new Date(
      timestampRoute.hops[currentIndex].scheduledAt
    ).getTime()
    const prevTime = new Date(
      timestampRoute.hops[currentIndex - 1].scheduledAt
    ).getTime()
    const diffMinutes = Math.round((currentTime - prevTime) / (1000 * 60))
    if (diffMinutes < 60) return `${diffMinutes} minutes after previous hop`
    if (diffMinutes < 24 * 60) {
      const hours = Math.floor(diffMinutes / 60)
      const mins = diffMinutes % 60
      return `${hours}h ${mins}m after previous hop`
    }
    const days = Math.floor(diffMinutes / (24 * 60))
    const hours = Math.floor((diffMinutes % (24 * 60)) / 60)
    return `${days}d ${hours}h after previous hop`
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='flex flex-col bg-[var(--chinese-black-800)] rounded-3xl p-6 border border-[var(--white-100-transparency-05)] gap-4'
      style={{ boxShadow: 'inset 0px 1px 0px rgba(255,255,255,0.08)' }}
    >
      <div className='mb-1'>
        <h2 className='not-italic font-medium text-xl leading-6 text-[var(--white-100)]'>
          Create {type} Route
        </h2>
      </div>

      <div>
        <label className={labelBase}>
          Amount per hop{' '}
          <span className='text-[var(--white-100-transparency-45)]'>
            ({type} tokens)
          </span>
        </label>
        <input
          type='number'
          step='0.000001'
          value={timestampRoute.hopAmountTokens}
          onChange={e =>
            setTimestampRoute(prev => ({
              ...prev,
              hopAmountTokens: e.target.value,
            }))
          }
          placeholder='0.1'
          className={inputBase}
          required
          min='0'
        />
      </div>

      {type === 'SPL' && (
        <div>
          <label className={labelBase}>SPL Token</label>
          <TokenSelector
            value={timestampRoute.splMint || ''}
            onChange={handleTokenChange}
            placeholder='Select a configured token from your wallet'
            required
            className='w-full'
            useConfiguredTokensOnly={true}
          />
        </div>
      )}

      <div className='flex justify-between items-center'>
        <h3 className='text-lg font-semibold text-[var(--white-100)]'>
          Route Hops
        </h3>
        <button
          type='button'
          onClick={addHop}
          className='rounded-2xl px-4 py-2 bg-[var(--laser-lemon-500)] text-black text-sm'
        >
          Add Hop
        </button>
      </div>

      {timestampRoute.hops.map((hop, index) => (
        <div
          key={index}
          className='rounded-3xl border border-[var(--white-100-transparency-10)] bg-[var(--chinese-black-500)] p-4'
        >
          <div className='flex justify-between items-center mb-3'>
            <h4 className='text-[var(--white-100)]'>Hop {index + 1}</h4>
            {timestampRoute.hops.length > 1 && (
              <button
                type='button'
                onClick={() => removeHop(index)}
                className='text-[var(--red-pastel-500)]'
              >
                Remove
              </button>
            )}
          </div>
          <div className='grid grid-cols-1 gap-3'>
            <div>
              <label className={labelBase}>Recipient Address</label>
              <input
                type='text'
                value={hop.recipient}
                onChange={e => updateHop(index, 'recipient', e.target.value)}
                placeholder='Recipient wallet address'
                className={inputBase}
                required
              />
            </div>
            <div>
              <label className={labelBase}>
                Scheduled Execution Time{' '}
                <span className='text-[var(--white-100-transparency-45)]'>
                  (Your Timezone)
                </span>
              </label>
              {index === 0 ? (
                <input
                  type='text'
                  value='Now (when route is deployed)'
                  disabled
                  className={`${inputBase} bg-[var(--eerie-black-700)] text-[var(--white-100-transparency-70)] cursor-not-allowed`}
                />
              ) : (
                <TimezoneAwareDatePicker
                  utcValue={hop.scheduledAt}
                  onUtcChange={utcString =>
                    updateHop(
                      index,
                      'scheduledAt',
                      utcString || getDefaultScheduledTime(5)
                    )
                  }
                  showTimeSelect={true}
                  minDate={new Date()}
                  placeholderText='Select date and time'
                  showTimezoneSelector={false}
                  className={inputBase}
                />
              )}
              <p className='text-xs text-[var(--white-100-transparency-60)] mt-1'>
                <strong>{calculateDelay(index)}</strong>
                {index > 0 && (
                  <span className='block mt-1'>
                    Executes on{' '}
                    <TimezoneAwareDateDisplay
                      utcTimestamp={hop.scheduledAt}
                      format='short'
                      className='font-medium'
                    />
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      ))}

      {(error || createRouteError) && (
        <div className='p-3 rounded-2xl bg-[var(--red-pastel-500)]/10 border border-[var(--red-pastel-500)] text-[var(--red-pastel-500)]'>
          {error || createRouteError}
        </div>
      )}

      <div className='flex justify-end'>
        <button
          type='submit'
          disabled={
            isLoading ||
            isCreatingRoute ||
            timestampRoute.hops.some(hop => !hop.recipient)
          }
          className={`rounded-3xl text-[var(--black-900)] not-italic font-medium text-base leading-5 px-6 py-3 shadow-[0_8px_24px_var(--black-900-transparency-45)] transition ${
            isLoading ||
            isCreatingRoute ||
            timestampRoute.hops.some(hop => !hop.recipient)
              ? 'bg-[var(--laser-lemon-500-transparency-30)] cursor-not-allowed'
              : 'bg-[var(--laser-lemon-500)] hover:brightness-95'
          }`}
        >
          {isLoading || isCreatingRoute
            ? 'Saving Route...'
            : `Save ${type} Route`}
        </button>
      </div>
    </form>
  )
}
