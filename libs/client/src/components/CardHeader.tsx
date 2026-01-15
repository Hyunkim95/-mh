import React from 'react'
import clsx from 'clsx'

export interface CardHeaderTab {
  key: string
  label?: string
  onTabClick: (key: string) => void,
  icon: string | React.ReactElement | React.ElementType
}

type MaybeFn = string | null | ((tabKey: string, isActive: boolean) => string)

export interface CardHeaderClassNames {
  mainCardHeaderContainer?: string
  tabsContainer?: string
  button?: { base?: string; active?: string; inactive?: string; final?: MaybeFn }
  iconContainer?: {
    base?: string
    active?: string
    inactive?: string
    final?: MaybeFn
  }
  iconColor?: { active?: string; inactive?: string; final?: MaybeFn }
  label?: { base?: string; active?: string; inactive?: string }
}

export interface CardHeaderProps {
  // Tabs configuration (supports 1..N tabs)
  tabs: CardHeaderTab[]
  activeKey: string
  // Optional left side slot (actions, buttons, etc.)
  leftSlot?: React.ReactNode
  // Optional right side slot (actions, selectors, etc.)
  rightSlot?: React.ReactNode
  // Optional style overrides per element/state
  headerClasses?: CardHeaderClassNames
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  tabs,
  activeKey,
  leftSlot,
  rightSlot,
  headerClasses,
}) => {
  return (
    <div
      className={clsx(
        'flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 sm:gap-0 mb-5',
        headerClasses?.mainCardHeaderContainer || ''
      )}
    >
      <div className="flex flex-row items-center gap-6">
        {leftSlot && (
          <div className='flex items-center gap-2'>
            {leftSlot}
          </div>
        )}
        <div
          className={clsx(
            'flex flex-row items-center gap-6',
            headerClasses?.tabsContainer || ''
          )}
        >
        {tabs.map((tab, idx) => {
          const isActive = tab.key === activeKey
          const defaultTextActive =
            'not-italic font-medium text-xl leading-6 text-[#ffffff]'
          const defaultTextInactive =
            'not-italic font-medium text-xl leading-[23px] text-[rgba(255,255,255,0.17)]'
          const textClass = `${headerClasses?.label?.base || ''} ${
            isActive
              ? headerClasses?.label?.active || defaultTextActive
              : headerClasses?.label?.inactive || defaultTextInactive
          }`.trim()
          const defaultColor = isActive
            ? headerClasses?.iconColor?.active || '#ffffff'
            : headerClasses?.iconColor?.inactive || 'rgba(255,255,255,0.17)'
          const icFinal = headerClasses?.iconColor?.final
          const color = icFinal
            ? typeof icFinal === 'function'
              ? icFinal(tab.key, isActive) || defaultColor
              : icFinal || defaultColor
            : defaultColor

          return (
            <button
              key={tab.key}
              type='button'
              onClick={() => tab.onTabClick(tab.key)}
              role='tab'
              aria-selected={isActive}
              className={`${
                idx === 0
                  ? 'flex items-center justify-center gap-2'
                  : 'flex items-center justify-center gap-1'
              } ${headerClasses?.button?.base || ''} ${
                isActive
                  ? headerClasses?.button?.active || ''
                  : headerClasses?.button?.inactive || ''
              } ${
                headerClasses?.button?.final
                  ? typeof headerClasses.button.final === 'function'
                    ? headerClasses.button.final(tab.key, isActive)
                    : headerClasses.button.final
                  : ''
              }`.trim()}
            >
              <div
                className={`h-4 w-4 flex items-center justify-center ${
                  headerClasses?.iconContainer?.base || ''
                } ${
                  isActive
                    ? headerClasses?.iconContainer?.active || ''
                    : headerClasses?.iconContainer?.inactive || ''
                } ${
                  headerClasses?.iconContainer?.final
                    ? typeof headerClasses.iconContainer.final === 'function'
                      ? headerClasses.iconContainer.final(tab.key, isActive)
                      : headerClasses.iconContainer.final
                    : ''
                }`.trim()}
                style={{ color }}
              >
                {typeof tab.icon === 'string' ? (
                  <img
                    src={tab.icon}
                    alt={`${tab.key}-icon`}
                    className='h-full w-full object-contain'
                  />
                ) : React.isValidElement(tab.icon) ? (
                  React.cloneElement(
                    tab.icon as React.ReactElement<{ color?: string }>,
                    { color }
                  )
                ) : (
                  (() => {
                    const Icon = tab.icon as React.ElementType
                    return <Icon />
                  })()
                )}
              </div>
              {tab.label && (
                <div className={textClass} style={{ fontFamily: 'Roboto' }}>
                  {tab.label}
                </div>
              )}
            </button>
          )
        })}
        </div>
      </div>

      {rightSlot && (
        <div className='flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-start sm:justify-end'>
          {rightSlot}
        </div>
      )}
    </div>
  )
}
