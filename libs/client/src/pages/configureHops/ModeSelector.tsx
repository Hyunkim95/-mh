import React from 'react'
import clsx from 'clsx'
import { ReactComponent as CustomRouteIcon } from '../../../assets/icons/custom-route.svg'

export type RouteMode = 'easy' | 'custom'

interface ModeSelectorProps {
  selectedMode: RouteMode
  onModeChange: (mode: RouteMode) => void
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  selectedMode,
  onModeChange,
}) => {
  return (
    <div className="flex flex-col items-center">
      {/* Header Badge */}
      <div className="mb-4">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--laser-lemon-500)] text-[var(--chinese-black-800)] text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-[var(--chinese-black-800)]" />
          Select method
        </span>
      </div>

      {/* Title */}
      <h2 className="text-xl font-medium text-[var(--white-100)] mb-8">
        Choose your routing style
      </h2>

      {/* Mode Cards */}
      <div className="flex gap-6 w-full max-w-2xl justify-center">
        {/* Easy Route Card */}
        <button
          type="button"
          onClick={() => onModeChange('easy')}
          className={clsx(
            'group relative flex-1 min-w-[240px] max-w-[280px] h-[340px] flex flex-col items-center justify-center rounded-3xl transition-all border-2 overflow-hidden',
            selectedMode === 'easy'
              ? 'border-[var(--laser-lemon-500)] bg-[var(--eerie-black-700)]'
              : 'border-[rgba(255,255,255,0.08)] bg-[var(--eerie-black-700)] hover:border-[var(--laser-lemon-500-transparency-30)]'
          )}
        >
          {/* Glowing Icon Container */}
          <div className="flex-1 w-full flex items-center justify-center">
            <div className="w-24 h-24 rounded-[32px] bg-[var(--laser-lemon-500)] flex items-center justify-center shadow-[0_0_120px_rgba(251,255,105,0.5)] group-hover:shadow-[0_0_150px_rgba(251,255,105,0.7)] transition-all duration-500">
              <svg className="w-12 h-12 text-[var(--chinese-black-800)]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
              </svg>
            </div>
          </div>

          <div className="mb-8 text-center">
            <span className="block text-[var(--white-100)] text-lg font-bold mb-2">
              Easy Route
            </span>
            <span className="block text-[var(--philippine-gray-500)] text-sm font-medium">
              Fast setup
            </span>
          </div>
        </button>

        {/* Custom Route Card */}
        <button
          type="button"
          onClick={() => onModeChange('custom')}
          className={clsx(
            'group relative flex-1 min-w-[240px] max-w-[280px] h-[340px] flex flex-col items-center justify-between rounded-3xl transition-all border-2 overflow-hidden',
            selectedMode === 'custom'
              ? 'border-[var(--laser-lemon-500)] bg-[var(--eerie-black-700)]'
              : 'border-[rgba(255,255,255,0.08)] bg-[var(--eerie-black-700)] hover:border-[var(--laser-lemon-500-transparency-30)]'
          )}
        >
          {/* Custom Route Graphic */}
          <div className="w-full flex-1 flex items-center justify-center overflow-hidden opacity-90 group-hover:opacity-100 transition-opacity">
            <CustomRouteIcon className="w-full h-full object-cover transform scale-105" />
          </div>

          <div className="mb-8 text-center relative z-10 bg-[var(--eerie-black-700)] w-full pt-4">
            <span className="block text-[var(--white-100)] text-lg font-bold mb-2">
              Custom Route
            </span>
            <span className="block text-[var(--philippine-gray-500)] text-sm font-medium">
              Full control over every hop
            </span>
          </div>
        </button>
      </div>
    </div>
  )
}
