import type { Route } from './types'
import OpenIcon from './../../../assets/history/open-icon.svg'
import CloseIcon from '../../../assets/history/closed-icon.svg'
import { useReplayRoute } from '../../hooks/useReplayRoute'
import { useDeploy } from '../../hooks/useDeploy'
import { trpc } from '../../trpc'
import { useState } from 'react'
import { Button } from '../Button'

interface RouteItemProps {
  route: Route
  isOpen?: boolean
  onToggle?: () => void
}
export function trimAddress(address: string, chars = 4) {
  if (!address) return "";
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export const RouteItem = ({ route }: RouteItemProps) => {
  const [open, setOpen] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const { replay, isPending } = useReplayRoute()
  const { deploy } = useDeploy()
  const utils = trpc.useUtils()
  const isCompleted = route.status === 'completed'
  const isDeployed = route.deploymentStatus === 'deployed'
  const isDraft = !isDeployed
  const hopsCount = route.hops?.length ?? 0

  // Fetch route state to get current hop index
  const routeStateQuery = trpc.contract.getRouteState.useQuery(
    {
      routeId: route.routeId || 0,
    },
    {
      enabled: route.deploymentStatus === 'deployed' && route.status !== 'completed',
    }
  )
  const currentHopIndex = routeStateQuery.data?.data?.currentHopIndex || 0
  const formattedAmount =
    route.hopAmountTokens != null
      ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(
          Number(route.hopAmountTokens)
        )
      : null

  const handleReplay = async () => {
    const numericId = Number(route.id)
    if (!Number.isFinite(numericId)) {
      // silently ignore if this mock item doesn't have a numeric DB id
      return
    }
    // fromWallet is rendered as the wallet in this component; assume it's the creator
    await replay({ id: numericId, creator: route.creator })
  }

  const handleDeploy = async () => {
    if (isDeploying) return
    setIsDeploying(true)
    try {
      const hopsArray = Array.isArray(route.hops) ? route.hops : []
      const formattedHops = hopsArray.map((hop: any) => ({
        recipient: hop.recipient,
        delaySeconds: String(hop.delaySeconds ?? 0),
      }))
      await deploy(
        {
          routeId: route.routeId,
          databaseId: route.id,
          routes: formattedHops,
          hopAmount: route.hopAmountRaw,
          splMint:
            route.tokenType === 'SPL'
              ? route.tokenMint ?? undefined
              : undefined,
        },
        route.tokenType as 'SPL' | 'SOL'
      )
      // Refresh the list after successful deploy to update status/button
      await utils.routes.getByCreator.invalidate({ creator: route.creator })
    } finally {
      setIsDeploying(false)
    }
  }

  const onToggle = () => {
    setOpen(!open)
  }

  const getStepDetails = (step: Route) => {
    const dateOptions: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }

    // // COMPLETED: stayed + departure
    // if (step.status === "completed") {
    //   const departedDate = new Date(step.).toLocaleString(undefined, dateOptions);
    //   return `Stayed for ${
    //   }, departed at ${departedDate}`;
    // }

    // // ACTIVE / IN-PROGRESS: currently holding
    // if (step.status === "active" && step.heldDuration) {
    //   return `Currently holding for ${step.heldDuration}`;
    // }

    // // UPCOMING / PENDING: expected arrival
    // if (step.status === "upcoming" && step.hops) {
    //   const arrivalDate = new Date(step.arrivalTime).toLocaleString(undefined, dateOptions);
    //   return `Expected arrival at ${arrivalDate}`;
    // }

    return ''
  }

  return (
    <div className='relative flex flex-col bg-[var(--dark-jungle-green-500)] rounded-xl shadow-sm overflow-hidden'>
      {/* Header */}
      <button onClick={onToggle}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full p-4 gap-3">
        {/* Mobile layout - matches Figma */}
        <div className="sm:hidden w-full">
          <div className="flex flex-row items-start justify-between w-full">
            {/* Left side - Token info */}
            <div className="flex flex-row items-start gap-3">
              {/* Token icon placeholder */}
              <div className="w-10 h-10 rounded-full bg-[var(--white-100-transparency-10)] flex items-center justify-center flex-shrink-0">
                <span className="text-[var(--white-100)] text-xs font-medium">
                  {route.tokenSymbol?.charAt(0) || route.tokenType.charAt(0)}
                </span>
              </div>
              <div className="flex flex-col items-start">
                <div className="flex flex-row items-center gap-2">
                  <span className="text-white font-medium text-base">{route.tokenSymbol || route.tokenType}</span>
                  <span className="text-gray-500 text-base">{formattedAmount || '0'}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Current Wallet
                  <div className="text-white">{trimAddress(route.creator)}</div>
                  <div className="mt-1">Route #{route.id}</div>
                </div>
              </div>
            </div>
            
            {/* Right side - Status */}
            <div className="flex flex-col items-end">
              <div className="text-xs text-gray-400">Status</div>
              <div className={`text-sm font-medium mt-1 ${
                isCompleted ? "text-green-400" : isDraft ? "text-gray-400" : "text-yellow-400"
              }`}>
                {isCompleted ? 'Complete' : isDraft ? 'Draft' : 'Pending'}
              </div>
            </div>
          </div>
        </div>

        {/* Desktop layout - original */}
        <div className="hidden sm:flex flex-row items-center gap-3 w-full sm:w-auto">
          {/* Route Name & Token */}
          <div className="flex flex-col items-start text-left min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-sm text-white font-medium truncate">{route.name || `Route #${route.id}`}</div>
              <div className="text-xs text-gray-400">•</div>
              <div className="text-sm text-white">{route.tokenSymbol || route.tokenType}</div>
            </div>
            <div className="text-xs text-gray-400">
              {formattedAmount ? `${formattedAmount} • ` : ''}{hopsCount} hops
            </div>
          </div>
        </div>

        {/* Desktop only: Additional info columns */}
        <div className="hidden sm:flex items-center gap-6">
          {/* Creator/Wallet */}
          <div className="flex flex-col items-start text-left min-w-0">
            <div className="text-sm text-white truncate">{trimAddress(route.creator)}</div>
            <div className="text-xs text-gray-400">
              {isCompleted ? "Final Destination" : "Current Wallet"}
            </div>
          </div>

          {/* Hops */}
          <div className="flex flex-col items-center text-center min-w-[60px]">
            <div className="text-sm text-white font-medium">{hopsCount}</div>
            <div className="text-xs text-gray-400">Hops</div>
          </div>

          {/* Status */}
          <div className="flex flex-col items-start text-left min-w-[80px]">
            <div
              className={`text-sm font-medium ${
                isCompleted ? "text-green-400" : isDraft ? "text-gray-400" : "text-yellow-400"
              }`}
            >
              {isCompleted ? 'Completed' : isDraft ? 'Draft' : 'Pending'}
            </div>
            <div className="text-xs text-gray-400">Status</div>
          </div>
        </div>

        {/* Right side - Desktop only buttons */}
        <div className="hidden sm:flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {isDraft ? (
              <Button
                onClick={handleDeploy}
                disabled={isDeploying}
                variant='ghost'
                className='!py-0 rounded-lg hover:text-[var(--black-900)] hover:bg-yellow-400 disabled:opacity-60 disabled:cursor-not-allowed h-8 w-[72px] text-sm'
              >
                Deploy
              </Button>
            ) : (
              <Button
                onClick={handleReplay}
                disabled={isPending}
                variant='ghost'
                className='!py-0 rounded-lg hover:text-[var(--black-900)] hover:bg-yellow-400 disabled:opacity-60 disabled:cursor-not-allowed h-8 w-[72px] text-sm'
              >
                Replay
              </Button>
            )}
          {open ? (
            <img src={OpenIcon} alt="open" className="w-7 h-7" />
          ) : (
            <img src={CloseIcon} alt="close" className="w-7 h-7" />
          )}
        </div>

        {/* Mobile copy icon */}
        <div className="sm:hidden absolute right-4 top-4">
          <div className="w-8 h-8 rounded-full bg-[var(--white-100-transparency-10)] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M13 5V11C13 12.1046 12.1046 13 11 13H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded section */}
      {open && (
        <div className='relative bg-[var(--dark-jungle-green-500)] pl-10 pr-4 pb-4 space-y-4'>
          {(route.hops ?? []).map((step, index, steps) => {
            const isLast = index === steps.length - 1
            const isCurrentHop = currentHopIndex === index + 1
            const isUpcoming = step.status === 'upcoming'
            const lineColor = isUpcoming ? 'bg-gray-600' : 'bg-yellow-400'

            return (
              <div
                key={`${route.id}-${index}`}
                className={`relative flex items-start bg-[var(--white-100-transparency-03)] gap-3 border ${
                  isCurrentHop ? 'border-yellow-400' : 'border-transparent'
                } rounded-2xl p-3`}
              >
                {/* Dot + connecting line */}
                <div className='absolute -left-[1rem] flex flex-col items-center'>
                  <div className={`w-[2px] h-[100px] ${lineColor}`} />
                  <div className='w-3 h-3 absolute -top-[-15px] left-[-5px] rounded-full border-2 bg-yellow-400 border-yellow-400' />
                </div>

                {/* Step content */}
                <div className='flex-1 flex flex-row gap-3 items-center'>
                  <div
                    className={`text-[11px] w-11 h-11 flex items-center justify-center rounded-2xl ${
                      isCurrentHop
                        ? 'text-[var(--black-900)] bg-yellow-300'
                        : 'text-[var(--white-100)] bg-[var(--white-100-transparency-05)]'
                    }`}
                  >
                    {isLast ? 'Final' : `#${index + 1}`}
                  </div>

                  {/* Wallet address and details */}
                  <div className='flex flex-col flex-1'>
                    <div className='flex flex-row items-center gap-2 justify-between'>
                      <div className='flex flex-row items-center gap-2'>
                        {step.status === 'completed' && (
                          <div className='text-[10px] text-[var(--black-900)] bg-yellow-400 w-3 h-3 rounded-[3px] flex items-center justify-center'>
                            ✓
                          </div>
                        )}
                        <div className="text-sm text-white">{trimAddress(step.recipient)}</div>
                      </div>
                      {isCurrentHop && (
                        <span className="bg-blue-900 text-blue-200 px-2 py-1 rounded-full text-xs font-semibold">
                          Current
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
