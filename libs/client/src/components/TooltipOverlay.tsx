import React from 'react'
import { createPortal } from 'react-dom'

interface TooltipOverlayProps {
  anchorRef: React.RefObject<HTMLElement | null>
  visible: boolean
  className?: string
  children: React.ReactNode
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export const TooltipOverlay: React.FC<TooltipOverlayProps> = ({
  anchorRef,
  visible,
  className = '',
  children,
  onMouseEnter,
  onMouseLeave,
}) => {
  const [style, setStyle] = React.useState<React.CSSProperties>({
    display: 'none',
  })

  React.useEffect(() => {
    if (!visible) {
      setStyle({ display: 'none' })
      return
    }
    const updatePosition = () => {
      const anchor = anchorRef.current
      if (!anchor) {
        setStyle({ display: 'none' })
        return
      }
      const rect = anchor.getBoundingClientRect()
      setStyle({
        position: 'fixed',
        top: `${rect.top}px`,
        left: `${rect.left - 8}px`,
        minWidth: `${rect.width}px`,
        height: `${rect.height}px`,
        zIndex: 9999,
      })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [visible, anchorRef])

  if (typeof document === 'undefined' || !visible) return null
  return createPortal(
    <div
      style={style}
      className={className}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>,
    document.body
  )
}
