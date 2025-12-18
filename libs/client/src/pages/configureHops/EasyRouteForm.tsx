import React, { useState, useMemo, useRef, forwardRef } from 'react'
import clsx from 'clsx'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import '../../../styles/datepicker.css'
import fallbackIcon from '../../assets/fallback.png'
import type { TokenAsset } from '../../store/atoms'
import { parseNumber, formatTokenAmount } from './utils'

interface EasyRouteFormProps {
  selectedAsset: TokenAsset | null
  selectedAmount: number
  onAmountChange: (amount: number) => void
  arrivalTime: Date | null
  onArrivalTimeChange: (date: Date | null) => void
  hopCount: number
  onHopCountChange: (count: number) => void
  destinationWallet: string
  onDestinationWalletChange: (wallet: string) => void
  walletError: string | null
  onWalletValidate: (wallet: string) => void
}

export const EasyRouteForm: React.FC<EasyRouteFormProps> = ({
  selectedAsset,
  selectedAmount,
  onAmountChange,
  arrivalTime,
  onArrivalTimeChange,
  hopCount,
  onHopCountChange,
  destinationWallet,
  onDestinationWalletChange,
  walletError,
  onWalletValidate,
}) => {
  const [imageError, setImageError] = useState(false)
  const [isEditingAmount, setIsEditingAmount] = useState(false)
  const [amountInputValue, setAmountInputValue] = useState('')
  const amountInputRef = useRef<HTMLInputElement>(null)

  const maxAmount = useMemo(
    () => parseNumber(selectedAsset?.amount),
    [selectedAsset]
  )

  const usdPerToken = useMemo(() => {
    const assetAmount = parseNumber(selectedAsset?.amount)
    const usd = parseNumber(selectedAsset?.usdValue as any)
    if (!assetAmount || !usd) return 0
    return usd / assetAmount
  }, [selectedAsset])

  const totalUsd = useMemo(() => {
    if (!selectedAmount || !usdPerToken) return 0
    return selectedAmount * usdPerToken
  }, [selectedAmount, usdPerToken])

  // Date picker dark theme CSS
  const darkThemeCss = `
  .mh-easy-datepicker.react-datepicker, .mh-easy-datepicker .react-datepicker {
    background: var(--chinese-black-800) !important;
    color: var(--white-100) !important;
    border: none !important;
    font-family: inherit;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5) !important;
  }
  .mh-easy-datepicker .react-datepicker__header {
    background: var(--chinese-black-800) !important;
    border-bottom: none !important;
    padding-top: 1rem !important;
  }
  .mh-easy-datepicker .react-datepicker__current-month {
    color: var(--white-100) !important;
    font-size: 1rem !important;
    font-weight: 600 !important;
    margin-bottom: 0.5rem !important;
  }
  .mh-easy-datepicker .react-datepicker__day-name {
    color: var(--philippine-gray-500) !important;
    font-weight: 500 !important;
    width: 2.3rem !important;
    line-height: 2.3rem !important;
    margin: 0.1rem !important;
  }
  .mh-easy-datepicker .react-datepicker__day { 
    color: var(--white-100) !important;
    width: 2.3rem !important;
    line-height: 2.3rem !important;
    margin: 0.1rem !important;
    border-radius: 0.5rem !important;
    font-weight: 500 !important;
  }
  .mh-easy-datepicker .react-datepicker__day:hover { 
    background: var(--white-100-transparency-10) !important; 
  }
  .mh-easy-datepicker .react-datepicker__day--disabled { 
    color: var(--white-100-transparency-30) !important; 
  }
  .mh-easy-datepicker .react-datepicker__day--selected,
  .mh-easy-datepicker .react-datepicker__day--keyboard-selected {
    background: var(--laser-lemon-500) !important;
    color: var(--chinese-black-800) !important;
    font-weight: 700 !important;
  }
  .mh-easy-datepicker .react-datepicker__day--outside-month {
    color: var(--white-100-transparency-30) !important;
  }
  .mh-easy-datepicker .react-datepicker__navigation {
    top: 1rem !important;
  }
  .mh-easy-datepicker .react-datepicker__navigation-icon::before { 
    border-color: var(--white-100) !important;
    border-width: 2px 2px 0 0 !important;
    height: 6px !important;
    width: 6px !important;
  }
  .mh-easy-datepicker .react-datepicker__time-container {
    background: var(--chinese-black-800) !important;
    border-left: 1px solid var(--white-100-transparency-10) !important;
  }
  .mh-easy-datepicker .react-datepicker__time-container .react-datepicker__time,
  .mh-easy-datepicker .react-datepicker__time-container .react-datepicker__time-box,
  .mh-easy-datepicker .react-datepicker__time-container .react-datepicker__time-list {
    background: var(--chinese-black-800) !important;
    color: var(--white-100) !important;
    border-color: var(--white-100-transparency-10) !important;
  }
  .mh-easy-datepicker .react-datepicker__time-list-item { color: var(--white-100) !important; }
  .mh-easy-datepicker .react-datepicker__time-list-item:hover { background: var(--white-100-transparency-10) !important; }
  .mh-easy-datepicker .react-datepicker__time-list-item--selected {
    background: var(--laser-lemon-500) !important;
    color: var(--chinese-black-800) !important;
  }
  `

  const handleAmountClick = () => {
    setAmountInputValue(selectedAmount.toString())
    setIsEditingAmount(true)
    setTimeout(() => amountInputRef.current?.select(), 0)
  }

  const handleAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmountInputValue(value)
    }
  }

  const handleAmountInputBlur = () => {
    const numValue = parseFloat(amountInputValue)
    if (!isNaN(numValue) && numValue >= 0) {
      const clamped = Math.max(0, Math.min(maxAmount, numValue))
      onAmountChange(Math.round(clamped * 1e6) / 1e6)
    }
    setIsEditingAmount(false)
  }

  const handleAmountInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAmountInputBlur()
    } else if (e.key === 'Escape') {
      setIsEditingAmount(false)
    }
  }

  const handleWalletChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    onDestinationWalletChange(value)
  }

  const handleWalletBlur = () => {
    onWalletValidate(destinationWallet)
  }

  const minDate = new Date()

  // Custom Input for DatePicker to match Figma design
  const DateCustomInput = forwardRef<HTMLButtonElement, any>(({ value, onClick }, ref) => (
    <button
      type="button"
      className="w-full h-full flex flex-col items-center justify-center text-center outline-none group"
      onClick={onClick}
      ref={ref}
    >
      {arrivalTime ? (
        <>
          <span className="text-sm font-medium text-[var(--white-100)] group-hover:text-[var(--laser-lemon-500)] transition-colors mb-1">
            {arrivalTime.toLocaleString('default', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          <span className="text-sm font-bold text-[var(--laser-lemon-500)]">
            {arrivalTime.toLocaleString('default', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
        </>
      ) : (
        <span className="text-[var(--philippine-gray-500)]">Select Date</span>
      )}
    </button>
  ))

  return (
    <div className="flex flex-col">
      <style dangerouslySetInnerHTML={{ __html: darkThemeCss }} />

      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center">
          <img src="/easy-route.svg" alt="Easy Route" className="w-full h-full" />
        </div>
        <div>
          <h2 className="text-xl font-medium text-[var(--white-100)]">
            Set your quick route
          </h2>
          <p className="text-sm text-[var(--philippine-gray-500)]">
            A few clicks to decide how, when, and where your assets travel
          </p>
        </div>
      </div>

      {/* Main Container for the 3 Cards */}
      <div className="bg-[#0C0D0F] rounded-[32px] p-6 mb-8 border border-[#25282c]/50">
        <div className="flex gap-4 h-[250px]">
          {/* Arrival Date Column */}
          <div className="flex-1 flex flex-col gap-3">
            <div className="text-[11px] text-[var(--philippine-gray-500)] font-semibold uppercase tracking-wider pl-1">
              Arrival Date
            </div>
            <div className="flex-1 bg-[#131416] rounded-[24px] border border-[#25282c] flex flex-col items-center justify-center relative shadow-inner hover:border-[var(--laser-lemon-500)]/20 transition-colors group">
              <DatePicker
                selected={arrivalTime}
                onChange={onArrivalTimeChange}
                showTimeSelect
                dateFormat="EEEE d MMMM HH:mm"
                minDate={minDate}
                timeIntervals={15}
                timeCaption="Time"
                customInput={<DateCustomInput />}
                calendarClassName="mh-easy-datepicker"
                popperClassName="z-[100]"
                portalId="root"
                renderCustomHeader={({
                  date,
                  decreaseMonth,
                  increaseMonth,
                  prevMonthButtonDisabled,
                  nextMonthButtonDisabled,
                }) => (
                  <div className="flex items-center justify-between px-2 py-2">
                    <button
                      onClick={decreaseMonth}
                      disabled={prevMonthButtonDisabled}
                      className="text-[var(--white-100)] disabled:opacity-30"
                      type="button"
                    >
                      &lt;
                    </button>
                    <span className="text-[var(--white-100)] font-medium">
                      {date.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                      onClick={increaseMonth}
                      disabled={nextMonthButtonDisabled}
                      className="text-[var(--white-100)] disabled:opacity-30"
                      type="button"
                    >
                      &gt;
                    </button>
                  </div>
                )}
              />
            </div>
          </div>

          {/* Hops Column */}
          <div className="flex-1 flex flex-col gap-3">
            <div className="text-[11px] text-[var(--philippine-gray-500)] font-semibold uppercase tracking-wider pl-1">
              Hops
            </div>
            <div
              className="flex-1 bg-[#131416] rounded-[24px] border border-[#25282c] flex flex-col items-center justify-center relative cursor-pointer group hover:border-[var(--laser-lemon-500)]/40 transition-all duration-300"
              onClick={() => onHopCountChange(hopCount >= 5 ? 1 : hopCount + 1)}
              title="Click to cycle hops"
            >
              {/* Central Glow Background */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(251,255,105,0.06)_0%,transparent_55%)] rounded-[24px]" />

              <div className="flex flex-col items-center justify-center h-full z-10">
                {/* Top lines */}
                <div className="flex gap-1.5 mb-2">
                  {[1, 2, 3].map(i => (
                    <div
                      key={`top-${i}`}
                      className={clsx(
                        'w-[3px] h-10 rounded-full transition-all duration-500',
                        i <= hopCount
                          ? 'bg-[var(--laser-lemon-500)] shadow-[0_0_15px_rgba(251,255,105,0.5)]'
                          : 'bg-[#25282c] shadow-none opacity-30'
                      )}
                    />
                  ))}
                </div>

                {/* Configured Number */}
                <div className="w-16 h-16 rounded-full bg-[var(--laser-lemon-500)] flex items-center justify-center shadow-[0_0_35px_rgba(251,255,105,0.4)] z-10 my-1 group-hover:scale-110 transition-transform duration-300">
                  <span className="text-3xl font-bold text-[var(--chinese-black-800)]">{hopCount}</span>
                </div>

                {/* Bottom lines */}
                <div className="flex gap-1.5 mt-2">
                  {[1, 2, 3].map(i => (
                    <div
                      key={`bottom-${i}`}
                      className={clsx(
                        'w-[3px] h-10 rounded-full transition-all duration-500',
                        i <= hopCount
                          ? 'bg-[var(--laser-lemon-500)] shadow-[0_0_15px_rgba(251,255,105,0.5)]'
                          : 'bg-[#25282c] shadow-none opacity-30'
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Token Column */}
          <div className="flex-1 flex flex-col gap-3">
            <div className="text-[11px] text-[var(--philippine-gray-500)] font-semibold uppercase tracking-wider pl-1">
              Token
            </div>
            <div className="flex-1 bg-[#131416] rounded-[24px] border border-[#25282c] flex flex-col items-center justify-center relative shadow-inner group">
              <div className="flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-[#1c1e22] overflow-hidden flex items-center justify-center mb-5 border border-[#2d3035] shadow-xl group-hover:scale-105 transition-transform duration-300">
                  <img
                    src={imageError ? fallbackIcon : selectedAsset?.icon || fallbackIcon}
                    alt={selectedAsset?.symbol || ''}
                    className="h-full w-full object-contain"
                    onError={() => setImageError(true)}
                  />
                </div>

                {/* Amount Display */}
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-[var(--white-100)] tracking-tight">
                      {formatTokenAmount(selectedAmount)}
                    </span>
                    <span className="text-xl font-bold text-[var(--white-100)] opacity-60">
                      {selectedAsset?.symbol}
                    </span>
                  </div>

                  {/* USD value */}
                  <div className="text-sm font-medium text-[var(--philippine-gray-500)]">
                    {totalUsd > 0
                      ? new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      }).format(totalUsd)
                      : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Final Destination */}
      <div className="mb-4">
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--white-100)] mb-3 pl-1">
          Final Destination
        </label>
        <div className="relative">
          <input
            type="text"
            value={destinationWallet}
            onChange={handleWalletChange}
            onBlur={handleWalletBlur}
            placeholder="Enter Solana wallet address"
            className={clsx(
              'w-full px-6 py-5 rounded-2xl bg-[#131416] text-[var(--white-100)] placeholder-[var(--philippine-gray-500)] border transition font-mono text-sm shadow-inner',
              walletError
                ? 'border-red-500 focus:border-red-500'
                : 'border-[#25282c] focus:border-[var(--laser-lemon-500)]'
            )}
            style={{ outline: 'none' }}
          />
          {destinationWallet && !walletError && (
            <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[var(--laser-lemon-500)]">
              ✓
            </div>
          )}
        </div>
        {walletError && (
          <p className="mt-2 text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-lg inline-block">
            {walletError}
          </p>
        )}
      </div>
    </div>
  )
}
