import React, { useState } from 'react'
import fallbackIcon from '../assets/fallback.png'

interface TokenCardProps {
  // Image URL for token/logo
  iconUrl: string
  // Short token symbol (e.g. SOL)
  symbol: string
  // Token or project name (e.g. Solana)
  name: string
  // Human readable amount (already formatted)
  amount: string | number
  // Optional fiat value display (already formatted with $)
  usdValue?: string | number
  // Optional click for the whole card
  onClick?: () => void
  // Optional selected state to apply hover styles persistently
  selected?: boolean
}

export const TokenCard: React.FC<TokenCardProps> = ({
  iconUrl,
  symbol,
  name,
  amount,
  usdValue,
  onClick,
  selected = false,
}) => {
  const [imageError, setImageError] = useState(false);
  
  return (
    <button
      type='button'
      onClick={onClick}
      className={`group w-full text-left rounded-2xl transition-all duration-200 position-relative shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-sm px-5 py-4 h-[82px] flex items-center ${
        selected
          ? 'bg-[var(--corn-yellow-500)] border-[var(--corn-yellow-500)] shadow-[0_0_20px_rgba(251,255,105,0.3)]'
          : 'bg-[var(--eerie-black-700-transparency-80)] border border-[var(--white-100-transparency-05)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] hover:bg-[var(--dark-gunmetal-500)] hover:border-[var(--white-100-transparency-15)]'
      }`}
    >
      <div className='flex items-center gap-4 w-full min-w-0'>
        <div className='h-12 w-12 rounded-full bg-[var(--chinese-black-600)] ring-1 ring-[var(--white-100-transparency-10)] overflow-hidden flex items-center justify-center flex-shrink-0'>
          <img
            src={imageError ? fallbackIcon : iconUrl}
            alt={`${symbol}-icon`}
            className='h-full w-full object-contain'
            onError={() => {
              setImageError(true)
            }}
          />
        </div>

        <div className='flex-1 min-w-0'>
          <div
            className={`font-semibold tracking-tight truncate ${selected ? 'text-black' : 'text-white'}`}
            style={{
              fontSize: 'clamp(12px, 2vw, 16px)',
              lineHeight: '1.2',
            }}
          >
            {symbol}
          </div>
          <div
            className={`truncate mt-1 ${selected ? 'text-black' : 'text-[var(--white-100-transparency-60)]'}`}
            style={{
              fontSize: 'clamp(10px, 1.5vw, 13px)',
              lineHeight: '1.2',
            }}
          >
            {name}
          </div>
        </div>

        <div className='text-right min-w-0 flex-shrink-0'>
          <div
            className={`font-semibold tracking-tight truncate ${selected ? 'text-black' : 'text-[var(--white-100-transparency-90)]'}`}
            style={{
              fontSize: 'clamp(11px, 1.8vw, 16px)',
              lineHeight: '1.2',
            }}
          >
            {amount}
          </div>
          {usdValue !== undefined && usdValue !== '' && (
            <div
              className={`truncate mt-1 ${selected ? 'text-black' : 'text-[var(--white-100-transparency-50)]'}`}
              style={{
                fontSize: 'clamp(10px, 1.5vw, 13px)',
                lineHeight: '1.2',
              }}
            >
              {usdValue}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
