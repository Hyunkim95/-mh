import React from 'react'

export const SkeletonCard: React.FC = () => {
  return (
    <div className='w-full h-[82px] rounded-3xl bg-[#222426] border border-[var(--white-100-transparency-05)] md:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-sm px-5 py-4 flex items-center animate-pulse'>
      {/* <div className='flex items-center gap-4 w-full'>
        <div className='h-12 w-12 rounded-full bg-[var(--chinese-black-600)] ring-1 ring-[var(--white-100-transparency-10)] flex-shrink-0' />

        <div className='flex-1 min-w-0'>
          <div className='h-4 w-16 bg-[var(--white-100-transparency-10)] rounded mb-2' />
          <div className='h-3 w-20 bg-[var(--white-100-transparency-10)] rounded' />
        </div>

        <div className='text-right'>
          <div className='h-4 w-20 bg-[var(--white-100-transparency-10)] rounded mb-2' />
          <div className='h-3 w-16 bg-[var(--white-100-transparency-10)] rounded' />
        </div>
      </div> */}
    </div>
  )
}
