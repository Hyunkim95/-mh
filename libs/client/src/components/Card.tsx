import React from 'react'
import clsx from 'clsx'
import {
  CardHeader,
  type CardHeaderTab,
  type CardHeaderClassNames,
} from './CardHeader'

interface CardHeaderConfig {
  tabs: CardHeaderTab[]
  activeKey: string
  leftSlot?: React.ReactNode
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
  cardMaxHeight?: string
  // Optional style overrides per element/state
  cardClasses?: CardClassNames
  // Optional additional inline styles for the main card container
  cardStyle?: React.CSSProperties
}

export const Card: React.FC<CardProps> = ({
  cardHeader,
  cardBody,
  cardFooter,
  cardHeight = '790px',
  cardMaxHeight = '790px',
  cardClasses,
  cardStyle,
}) => {
  return (
    <>
      <style>{`
        @media (min-width: 640px) {
          .card-desktop-styles {
            background: #1F2224;
            box-shadow: inset 0px 0px 0px 1px rgba(255, 255, 255, 0.1), inset 0px 1px 1px rgba(255, 255, 255, 0.15), inset 0px -1px 1px rgba(255, 255, 255, 0.1), inset 1px 0px 1px rgba(255, 255, 255, 0.1), inset -1px 0px 1px rgba(255, 255, 255, 0.1), 30.3463px 34.9442px 72.5553px rgba(0, 0, 0, 0.08);
            backdrop-filter: blur(43.2205px);
          }
        }
      `}</style>
      <div
        className={clsx(
          'max-w-[709px] w-full box-border px-4 sm:px-12 py-6 sm:py-8 rounded-3xl flex flex-col mb-10 relative',
          'card-desktop-styles',
          cardClasses?.mainCardContainer || '',
          cardHeight === 'auto' && `h-auto max-h-[${cardMaxHeight}] sm:h-[${cardHeight}] sm:max-h-none`
        )}
        style={{
          ...(cardHeight !== 'auto' && { height: cardHeight }),
          border: '1px solid transparent',
          background: 'linear-gradient(#1F2224, #1F2224) padding-box, linear-gradient(0deg, rgba(255,255,255,0) 23%, rgba(255,255,255,0.5) 49%, rgba(255,255,255,0) 75%) border-box',
          ...cardStyle,
        }}
      >
      {cardHeader && (
        <CardHeader
          tabs={cardHeader.tabs}
          activeKey={cardHeader.activeKey}
          leftSlot={cardHeader.leftSlot}
          rightSlot={cardHeader.rightSlot}
          headerClasses={cardHeader.headerClasses}
        />
      )}

      <div
        className={clsx(
          'overflow-y-auto mb-5 flex-1 min-h-0',
          cardClasses?.cardBodyContainer || ''
        )}
      >
        {cardBody}
      </div>

      {cardFooter && cardFooter}
      </div>
    </>
  )
}
