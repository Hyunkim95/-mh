import React, { useState, useEffect } from 'react'
import clsx from 'clsx'
import {
  CardHeader,
  type CardHeaderTab,
  type CardHeaderClassNames,
} from './CardHeader'

interface CardHeaderConfig {
  tabs: CardHeaderTab[]
  activeKey: string
  onTabChange: (key: string) => void
  rightSlot?: React.ReactNode
  headerClasses?: CardHeaderClassNames
}

interface CardClassNames {
  mainCardContainer?: string
  cardBodyContainer?: string
}

interface CardProps {
  cardHeader?: CardHeaderConfig
  cardBody: React.ReactNode
  cardFooter?: React.ReactNode
  // Optional fixed height for the card body section in pixels
  cardHeight?: string
  // Optional style overrides per element/state
  cardClasses?: CardClassNames
}

export const Card: React.FC<CardProps> = ({
  cardHeader,
  cardBody,
  cardFooter,
  cardHeight = '790px',
  cardClasses,
}) => {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  return (
    <div
      className={clsx(
        'max-w-[709px] w-full box-border px-6 sm:px-12 py-6 sm:py-8 rounded-3xl flex flex-col mb-10 relative card-border-glow',
        cardClasses?.mainCardContainer || ''
      )}
      style={{
        height: isMobile ? 'auto' : cardHeight,
        minHeight: isMobile ? 'calc(100vh - 100px)' : undefined,
        background: '#1F2224',
        boxShadow:
          'inset 0px 0px 0px 1px rgba(255, 255, 255, 0.1), inset 0px 1px 1px rgba(255, 255, 255, 0.15), inset 0px -1px 1px rgba(255, 255, 255, 0.1), inset 1px 0px 1px rgba(255, 255, 255, 0.1), inset -1px 0px 1px rgba(255, 255, 255, 0.1), 30.3463px 34.9442px 72.5553px rgba(0, 0, 0, 0.08)',
        backdropFilter: 'blur(43.2205px)',
      }}
    >
      {cardHeader && (
        <CardHeader
          tabs={cardHeader.tabs}
          activeKey={cardHeader.activeKey}
          onTabChange={cardHeader.onTabChange}
          rightSlot={cardHeader.rightSlot}
          headerClasses={cardHeader.headerClasses}
        />
      )}

      <div
        className={clsx(
          'overflow-y-auto overflow-x-hidden mb-5 flex-1 min-h-0',
          cardClasses?.cardBodyContainer || ''
        )}
      >
        {cardBody}
      </div>

      {cardFooter && cardFooter}
    </div>
  )
}
