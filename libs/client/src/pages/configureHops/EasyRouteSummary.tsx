import React, { useState } from 'react'
import fallbackIcon from '../../assets/fallback.png'
import type { TokenAsset, EasyRouteConfig } from '../../store/atoms'

import easyRouteIcon from '../../../assets/icons/easy-route.svg'

interface EasyRouteSummaryProps {
  selectedAsset: TokenAsset | null
  selectedAmount: number
  easyRouteConfig: EasyRouteConfig
  feePercentage?: number
}

export const EasyRouteSummary: React.FC<EasyRouteSummaryProps> = ({
  selectedAsset,
  selectedAmount,
  easyRouteConfig,
  feePercentage = 0.005,
}) => {
  const [imageError, setImageError] = useState(false)

  const formatAmount = (amount: number, symbol: string) => {
    return `${amount.toLocaleString()} ${symbol}`
  }

  const formatDate = (date: Date | null) => {
    // ...
    if (!date) return 'Not set'
    return date.toLocaleString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  const maskWalletAddress = (address: string) => {
    if (address.length < 8) return address
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center">
          <img src={easyRouteIcon} alt="Easy Route" className="w-full h-full" />
        </div>
        <div>
          <h2 className="text-xl font-medium text-[var(--white-100)]">
            Quick Route Summary
          </h2>
          <p className="text-sm text-[var(--philippine-gray-500)]">
            Review your route details before confirming
          </p>
        </div>
      </div>

      {/* Summary Card */}
      <div
        className="bg-[var(--chinese-black-800)] rounded-2xl p-6 border border-[var(--white-100-transparency-05)]"
        style={{
          boxShadow: 'inset 0px 1px 0px var(--white-100-transparency-08)',
        }}
      >
        {/* Token & Amount */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-[var(--black-900-transparency-40)] overflow-hidden flex items-center justify-center">
            <img
              src={imageError ? fallbackIcon : selectedAsset?.icon || fallbackIcon}
              alt={selectedAsset?.symbol || ''}
              className="h-full w-full object-contain"
              onError={() => setImageError(true)}
            />
          </div>
          <div>
            <div className="text-2xl font-bold text-[var(--white-100)]">
              {formatAmount(selectedAmount, selectedAsset?.symbol || '')}
            </div>
            <div className="text-sm text-[var(--philippine-gray-500)]">
              {selectedAsset?.name || ''}
            </div>
          </div>
        </div>

        {/* Route Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Arrival Time */}
          <div className="bg-[var(--eerie-black-700)] rounded-xl p-4">
            <div className="text-xs text-[var(--philippine-gray-500)] mb-2 uppercase tracking-wide">
              Arrival Time
            </div>
            <div className="text-[var(--white-100)] font-medium">
              {formatDate(easyRouteConfig.arrivalTime)}
            </div>
          </div>

          {/* Hop Count */}
          <div className="bg-[var(--eerie-black-700)] rounded-xl p-4">
            <div className="text-xs text-[var(--philippine-gray-500)] mb-2 uppercase tracking-wide">
              Number of Hops
            </div>
            <div className="text-[var(--white-100)] font-medium">
              {easyRouteConfig.hopCount} hops
            </div>
          </div>

          {/* Final Destination */}
          <div className="bg-[var(--eerie-black-700)] rounded-xl p-4 md:col-span-2">
            <div className="text-xs text-[var(--philippine-gray-500)] mb-2 uppercase tracking-wide">
              Final Destination
            </div>
            <div className="text-[var(--white-100)] font-medium font-mono">
              {maskWalletAddress(easyRouteConfig.destinationWallet)}
            </div>
            <div className="text-xs text-[var(--philippine-gray-500)] mt-1">
              {easyRouteConfig.destinationWallet}
            </div>
          </div>
        </div>

        {/* Fee Breakdown */}
        <div className="mt-6 pt-4 border-t border-[var(--white-100-transparency-10)]">
          <div className="text-xs text-[var(--philippine-gray-500)] mb-3 uppercase tracking-wide">
            Fee Breakdown
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--philippine-gray-500)]">Amount</span>
              <span className="text-sm text-[var(--white-100)]">
                {selectedAmount} {selectedAsset?.symbol || ''}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--philippine-gray-500)]">
                Platform Fee ({(feePercentage * 100).toFixed(1)}%)
              </span>
              <span className="text-sm text-[var(--white-100)]">
                {(selectedAmount * feePercentage).toFixed(6)} {selectedAsset?.symbol || ''}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[var(--white-100-transparency-10)]">
              <span className="text-sm font-medium text-[var(--white-100)]">Total</span>
              <span className="text-sm font-medium text-[var(--laser-lemon-500)]">
                {(selectedAmount * (1 + feePercentage)).toFixed(6)} {selectedAsset?.symbol || ''}
              </span>
            </div>
          </div>
        </div>

        {/* Route Type Indicator */}
        <div className="mt-6 pt-4 border-t border-[var(--white-100-transparency-10)]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--laser-lemon-500)]"></div>
            <span className="text-sm text-[var(--philippine-gray-500)]">
              Quick Route - Intermediate wallets will be auto-generated
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}