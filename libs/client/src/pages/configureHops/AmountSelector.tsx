import React, { useState, useRef } from 'react'
import { Slider } from '../../components/Slider'
import { TooltipOverlay } from '../../components/TooltipOverlay'
import { parseNumber, formatTokenAmount } from './utils'
import type { TokenAsset } from '../../store/atoms'
import fallbackIcon from '../../assets/fallback.png'

interface AmountSelectorProps {
  asset: TokenAsset | null
  amount: number
  onAmountChange: (amount: number) => void
  feePercentage?: number // Fee as decimal (e.g., 0.01 for 1%)
}

export const AmountSelector: React.FC<AmountSelectorProps> = ({
  asset,
  amount,
  onAmountChange,
  feePercentage = 0.01, // Default 1% fee
}) => {
  const [hoveredAmount, setHoveredAmount] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const amountDisplayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [imageError, setImageError] = useState(false);

  // Calculate max amount accounting for fee
  // If user has balance B and fee is F%, then max routable = B / (1 + F)
  // This ensures: routeAmount + fee = balance
  const maxAmount = React.useMemo(() => {
    const balance = parseNumber(asset?.amount)
    if (balance <= 0 || feePercentage <= 0) return balance
    // Max amount that can be routed = balance / (1 + fee)
    const maxRoutable = balance / (1 + feePercentage)
    // Round down to avoid precision issues that could cause insufficient funds
    return Math.floor(maxRoutable * 1e6) / 1e6
  }, [asset, feePercentage])

  const usdPerToken = React.useMemo(() => {
    const assetAmount = parseNumber(asset?.amount)
    const usd = parseNumber(asset?.usdValue as any)
    if (!assetAmount || !usd) return 0
    return usd / assetAmount
  }, [asset])

  const totalUsd = React.useMemo(() => {
    if (!amount || !usdPerToken) return 0
    return amount * usdPerToken
  }, [amount, usdPerToken])

  const handleSlider = (val: number) => {
    const clamped = Math.max(0, Math.min(maxAmount, val))
    onAmountChange(Math.round(clamped * 1e6) / 1e6)
  }

  const handleAmountClick = () => {
    setInputValue(amount.toString())
    setIsEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Allow empty, digits, and one decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setInputValue(value)
    }
  }

  const handleInputBlur = () => {
    const numValue = parseFloat(inputValue)
    if (!isNaN(numValue) && numValue >= 0) {
      handleSlider(numValue)
    }
    setIsEditing(false)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleInputBlur()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  return (
    <div className='flex flex-col bg-[var(--chinese-black-800)] rounded-3xl pt-32 px-4 pb-16 sm:pt-[76px] sm:px-10 sm:pb-[72px] border border-[var(--white-100-transparency-05)] mb-1'
      style={{
        boxShadow: 'inset 0px 1px 0px var(--white-100-transparency-08)',
      }}
    >
      {/* Amount display */}
      <div className='flex items-center justify-center gap-4 mb-6 min-w-0'>
        <div className='h-16 w-16 flex-shrink-0 rounded-full bg-[var(--black-900-transparency-40)] overflow-hidden flex items-center justify-center'>
          <img
            src={imageError ? fallbackIcon : asset ? asset.icon : fallbackIcon}
              alt={asset ? `${asset?.symbol}-icon` : ''}
              className='h-full w-full object-contain'
              onError={() => {
                setImageError(true);
              }}
            />
        </div>
        <div className='flex items-center gap-2 min-w-0 flex-1 justify-center'>
          {isEditing ? (
            <input
              ref={inputRef}
              type='text'
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              className='not-italic font-medium text-3xl sm:text-5xl md:text-6xl leading-tight sm:leading-[72px] text-center tracking-tight bg-transparent border-none outline-none'
              style={{
                background:
                  'linear-gradient(270deg, var(--white-100-transparency-50) 7%, var(--white-100) 53%, var(--white-100-transparency-50) 99%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                width: `${Math.max(inputValue.length, 1)}ch`,
                maxWidth: '100%',
              }}
            />
          ) : (
            <div
              ref={amountDisplayRef}
              onClick={handleAmountClick}
              className='not-italic font-medium text-3xl sm:text-5xl md:text-6xl leading-tight sm:leading-[72px] text-center text-transparent bg-clip-text tracking-tight drop-shadow-[0_8px_30px_var(--white-100-transparency-15)] overflow-hidden text-ellipsis whitespace-nowrap max-w-full cursor-pointer'
              style={{
                background:
                  'linear-gradient(270deg, var(--white-100-transparency-50) 7%, var(--white-100) 53%, var(--white-100-transparency-50) 99%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
              onMouseEnter={() => setHoveredAmount(true)}
              onMouseLeave={() => setHoveredAmount(false)}
            >
              {formatTokenAmount(amount || 0)}
            </div>
          )}
          <div
            className='not-italic font-medium text-3xl sm:text-5xl md:text-6xl leading-tight sm:leading-[72px] text-center text-transparent bg-clip-text tracking-tight drop-shadow-[0_8px_30px_var(--white-100-transparency-15)] flex-shrink-0'
            style={{
              background:
                'linear-gradient(270deg, var(--white-100-transparency-50) 7%, var(--white-100) 53%, var(--white-100-transparency-50) 99%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {' '}
            {asset?.symbol ?? ''}
          </div>
        </div>
      </div>

      {/* Total value */}
      <div className='flex flex-row items-center justify-center not-italic font-medium text-base leading-5 text-center gap-2 mb-9 w-full'>
        <span className='text-[var(--philippine-gray-500)]'>
          Total Value
        </span>
        <span className='text-[var(--white-100)]'>
          {totalUsd > 0
            ? new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
              }).format(totalUsd)
            : '—'}
        </span>
      </div>

      {/* Tooltip for amount */}
      {!isEditing && (
        <TooltipOverlay
          anchorRef={amountDisplayRef as React.RefObject<HTMLElement>}
          visible={hoveredAmount}
          className='flex items-center justify-start bg-[var(--eerie-black-700)] rounded-2xl p-2 pointer-events-none'
          onMouseEnter={() => setHoveredAmount(true)}
          onMouseLeave={() => setHoveredAmount(false)}
        >
        <div
          className='not-italic font-medium text-3xl sm:text-5xl md:text-6xl leading-tight sm:leading-[72px] text-center tracking-tight drop-shadow-[0_8px_30px_var(--white-100-transparency-15)] whitespace-nowrap'
          style={{
            background:
              'linear-gradient(270deg, var(--white-100-transparency-50) 7%, var(--white-100) 53%, var(--white-100-transparency-50) 99%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {formatTokenAmount(amount || 0)}
        </div>
        </TooltipOverlay>
      )}

      {/* Slider */}
      <div className='px-2 mb-7'>
        <Slider
          min={0}
          max={Math.max(0, maxAmount)}
          step={maxAmount >= 100 ? 1 : 0.01}
          value={Math.min(amount || 0, maxAmount || 0)}
          onChange={handleSlider}
        />
      </div>

      {/* Percent buttons */}
      <div className='flex items-center justify-center gap-2'>
        {[
          { label: '25%', val: 0.25 },
          { label: '50%', val: 0.5 },
          { label: 'Max', val: 1 },
        ].map(b => {
          // For Max, use maxAmount directly to avoid floating point precision issues
          const targetAmount = b.val === 1
            ? maxAmount
            : Math.round(maxAmount * b.val * 1e6) / 1e6
          const isActive = maxAmount > 0 && Math.abs(amount - targetAmount) < maxAmount * 0.001
          return (
            <button
              key={b.label}
              type='button'
              onClick={() => {
                if (maxAmount > 0) {
                  onAmountChange(targetAmount)
                }
              }}
              disabled={maxAmount <= 0}
              className={`rounded-[21px] not-italic font-medium text-base leading-4 text-center h-[55px] w-[55px] transition ${
                isActive
                  ? 'bg-[var(--laser-lemon-500)] text-[var(--black-900)]'
                  : 'bg-[var(--dark-gunmetal-500)] text-[var(--laser-lemon-500)] hover:bg-[var(--laser-lemon-500)] hover:text-[var(--black-900)] disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {b.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
