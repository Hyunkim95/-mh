import React from 'react'
import clsx from 'clsx'
import { ReactComponent as CustomRouteIcon } from '../../../assets/icons/custom-route.svg'

import TagStars from '../../assets/landing/tag-stars.svg'

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
    <div className='flex flex-col items-center'>
      {/* Header Badge */}
      {/* <span className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--laser-lemon-500)] text-[var(--chinese-black-800)] text-xs font-medium mt-8 mb-4'>
        <span className='w-2 h-2 rounded-full bg-[var(--chinese-black-800)]' />
        Select method
      </span> */}

      <div
        className='inline-flex items-center gap-3 px-3 sm:px-3 py-2 sm:py-2 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl mt-10 mb-6'
        style={{ animation: 'fadeInUp 0.6s ease-out' }}
      >
        <img src={TagStars} alt='' className='w-4 h-4 sm:w-5 sm:h-5' />
        <span
          className='text-xs sm:text-base not-italic font-medium leading-5 text-white'
          style={{ fontFamily: 'Roboto, sans-serif' }}
        >
          Select method
        </span>
      </div>

      {/* Title */}
      <h2
        className='text-3xl font-normal leading-9 text-center text-[var(--white-100)] mb-[52px]'
        style={{ fontFamily: 'Roboto, sans-serif' }}
      >
        Choose your routing style
      </h2>

      {/* Mode Cards */}
      <div className='flex flex-col sm:flex-row gap-4 sm:gap-6 w-full max-w-2xl justify-center px-4 sm:px-0 mb-5 sm:mb-12'>
        {/* Easy Route Card */}
        <button
          type='button'
          onClick={() => onModeChange('easy')}
          className={clsx(
            'group relative flex-1 sm:min-w-[240px] sm:max-w-[260px] h-[140px] sm:h-[298px] flex flex-col items-center justify-center rounded-3xl transition-all border-2 overflow-hidden',
            selectedMode === 'easy'
              ? 'border-[var(--laser-lemon-500)] bg-[var(--eerie-black-700)]'
              : 'border-[rgba(255,255,255,0.08)] bg-[var(--eerie-black-700)] hover:border-[var(--laser-lemon-500-transparency-30)]'
          )}
        >
          {/* Glowing Icon Container */}
          <div className='flex-1 w-full flex items-center justify-center py-2'>
            <div className='w-16 h-16 sm:w-[128px] sm:h-[128px] rounded-[28px] sm:rounded-[48px] bg-[var(--laser-lemon-500-transparency-07)] flex items-center justify-center'>
              <div className='w-14 h-14 sm:w-[108px] sm:h-[108px] rounded-[24px] sm:rounded-[40px] bg-[var(--laser-lemon-500-transparency-13)] flex items-center justify-center'>
                <div
                  className='w-12 h-12 sm:w-[84px] sm:h-[84px] rounded-[20px] sm:rounded-[32px] bg-[var(--laser-lemon-500)] flex items-center justify-center'
                  style={{
                    filter:
                      'drop-shadow(0px 3.03099px 13.7152px rgba(0, 0, 0, 0.23)) drop-shadow(0px -55.3156px 98.7346px rgba(251, 255, 105, 0.48))',
                  }}
                >
                  <svg
                    className='w-6 h-6 sm:w-12 sm:h-12 text-[var(--chinese-black-800)]'
                    viewBox='0 0 24 24'
                    fill='currentColor'
                  >
                    <path d='M13 2L3 14H12L11 22L21 10H12L13 2Z' />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className='flex flex-col items-center gap-1 mb-4 sm:mb-8 text-center'>
            <span
              className='not-italic font-medium text-base leading-5 text-center text-[var(--white-100)]'
              style={{ fontFamily: 'Roboto, sans-serif' }}
            >
              Easy Route
            </span>
            <span
              className='text-xs not-italic font-normal leading-5 text-center text-[var(--white-100-transparency-60)]'
              style={{ fontFamily: 'Roboto, sans-serif' }}
            >
              Fast setup
            </span>
          </div>
        </button>

        {/* Custom Route Card */}
        <button
          type='button'
          onClick={() => onModeChange('custom')}
          className={clsx(
            'group relative flex-1 sm:min-w-[240px] sm:max-w-[260px] h-[140px] sm:h-[298px] flex flex-col items-center justify-between rounded-3xl transition-all border-2 overflow-hidden',
            selectedMode === 'custom'
              ? 'border-[var(--laser-lemon-500)] bg-[var(--eerie-black-700)]'
              : 'border-[rgba(255,255,255,0.08)] bg-[var(--eerie-black-700)] hover:border-[var(--laser-lemon-500-transparency-30)]'
          )}
        >
          {/* Custom Route Graphic */}
          <div className='w-full h-[60px] sm:h-[205px] flex items-center justify-center overflow-hidden opacity-90 group-hover:opacity-100 transition-opacity py-2 sm:py-0'>
            <CustomRouteIcon className='w-full h-full object-cover transform scale-75 sm:scale-105 max-h-[60px] sm:max-h-none' />
          </div>

          <div className='flex flex-col items-center gap-1 mb-4 sm:mb-8 text-center'>
            <span
              className='not-italic font-medium text-base leading-5 text-center text-[var(--white-100)]'
              style={{ fontFamily: 'Roboto, sans-serif' }}
            >
              Custom Route
            </span>
            <span
              className='text-xs not-italic font-normal leading-5 text-center text-[var(--white-100-transparency-60)]'
              style={{ fontFamily: 'Roboto, sans-serif' }}
            >
              Full control over every hop
            </span>
          </div>
        </button>
      </div>
    </div>
  )
}
