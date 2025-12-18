import React, { useState } from 'react'
import { maskAddress, formatDuration, parseNumber } from './utils'
import type { HopConfigItem, TokenAsset } from '../../store/atoms'
import fallbackIcon from '../../assets/fallback.png'

interface SummaryDisplayProps {
  routeName: string,
  hops: HopConfigItem[]
  selectedAsset: TokenAsset | null
  selectedAmount: number
}

export const SummaryDisplay: React.FC<SummaryDisplayProps> = ({
  routeName,
  hops,
  selectedAsset,
  selectedAmount,
}) => {
  const [imageError, setImageError] = useState(false);
  const usdPerToken = React.useMemo(() => {
    const amount = parseNumber(selectedAsset?.amount)
    const usd = parseNumber(selectedAsset?.usdValue as any)
    if (!amount || !usd) return 0
    return usd / amount
  }, [selectedAsset])

  const totalUsd = React.useMemo(() => {
    if (!selectedAmount || !usdPerToken) return 0
    return selectedAmount * usdPerToken
  }, [selectedAmount, usdPerToken])

  const lastHopWallet = React.useMemo(() => {
    const wallets = hops.map(h => (h.wallet || '').trim()).filter(Boolean)
    return wallets.length ? wallets[wallets.length - 1] : ''
  }, [hops])

  return (
    <div
      className='flex flex-col bg-[var(--chinese-black-800)] rounded-3xl p-6 border border-[var(--white-100-transparency-05)] gap-4'
      style={{
        boxShadow: 'inset 0px 1px 0px var(--white-100-transparency-08)',
      }}
    >
      <div className='flex flex-col gap-2'>
        <div className='not-italic font-medium text-base leading-4 text-[var(--white-100)]'>
          Route Name
        </div>
        <input
          placeholder='Name your Route'
          value={routeName || ''}
          readOnly
          className='w-full h-[56px] rounded-2xl bg-[var(--chinese-black-500)] border px-5 text-white placeholder-[var(--white-100-transparency-30)] outline-none shadow-[inset_0_1px_0_var(--white-100-transparency-06)] border-[var(--white-100-transparency-10)]'
        />
      </div>

      {/* Subtitles */}
      <div className='grid grid-cols-[177px_auto] gap-5 text-[13px] text-[var(--white-100-transparency-60)]'>
        <div>Token & Amount</div>
        <div>Hop Route</div>
      </div>

      {/* Token & Amount and Hop Route */}
      <div className='grid grid-cols-[177px_auto] gap-5'>
        {/* Token & Amount */}
        <div className='rounded-3xl border border-[var(--white-100-transparency-10)] bg-[var(--chinese-black-800)] p-6 flex flex-col items-center justify-center text-center'>
          <div className='h-14 w-14 rounded-full bg-[var(--black-900-transparency-40)] mb-4 overflow-hidden flex items-center justify-center'>
              <img
                src={
                  imageError ? fallbackIcon : (selectedAsset?.icon || fallbackIcon)
                }
                alt={selectedAsset ? `${selectedAsset.symbol}-icon` : ''}
                className='h-full w-full object-contain'
                onError={() => {
                  setImageError(true);
                }}
              />
          </div>
          <div className='text-2xl font-semibold'>
            {selectedAmount || 0} {selectedAsset?.symbol ?? ''}
          </div>
          <div className='text-sm text-[var(--white-100-transparency-60)]'>
            {usdPerToken
              ? new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(totalUsd || 0)
              : selectedAsset?.usdValue || '—'}
          </div>
        </div>

        {/* Hop route list */}
        <div className='rounded-3xl border border-[var(--white-100-transparency-10)] bg-[var(--chinese-black-500)] p-4 flex flex-col gap-3 max-h-[260px] overflow-y-auto pr-2'>
          {hops.map((h, i) => (
            <div
              key={`sum-hop-${i}`}
              className='grid grid-cols-[250px_62px] gap-2 items-center justify-center'
            >
              <div className='h-12 rounded-2xl bg-[var(--eerie-black-700)] border border-[var(--white-100-transparency-10)] px-4 flex items-center text-[var(--white-100-transparency-80)]'>
                <span className='text-[var(--white-100-transparency-50)] mr-3'>
                  #{i + 1}
                </span>
                <span className='truncate'>
                  {maskAddress(h.wallet || '')}
                </span>
              </div>
              <div className='h-12 rounded-2xl bg-[var(--eerie-black-700)] border border-[var(--white-100-transparency-10)] flex items-center justify-center text-[var(--white-100-transparency-80)]'>
                {h.delayMinutes ? formatDuration(h.delayMinutes) : '--'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Final Destination */}
      <div className='flex flex-col gap-2 mt-2'>
        <div className='not-italic font-medium text-base leading-4 text-[var(--white-100)]'>
          Final Destination
        </div>
        <input
          id='final-destination'
          value={lastHopWallet}
          readOnly
          placeholder='Enter final destination address'
          className='w-full h-[56px] rounded-2xl bg-[var(--chinese-black-500)] border px-5 text-white placeholder-[var(--white-100-transparency-30)] outline-none shadow-[inset_0_1px_0_var(--white-100-transparency-06)] border-[var(--white-100-transparency-10)]'
        />
      </div>
    </div>
  )
}
