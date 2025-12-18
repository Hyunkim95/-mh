import React, { useState, useMemo } from 'react'
import { useDeploy } from '../hooks/useDeploy'

export interface DeployModalRoute {
  id: number
  routeId: number
  name?: string | null
  tokenType: 'SOL' | 'SPL'
  tokenMint?: string | null
  tokenSymbol?: string | null
  hopAmountTokens: string
  hopAmountRaw: string
  hops: { recipient: string; scheduledAt: string }[]
}

interface DeployModalProps {
  isOpen: boolean
  onClose: () => void
  route: DeployModalRoute | null
  onDeploySuccess: () => void
}

type DeployStatus = 'idle' | 'deploying' | 'confirming' | 'success' | 'error'

export const DeployModal: React.FC<DeployModalProps> = ({
  isOpen,
  onClose,
  route,
  onDeploySuccess,
}) => {
  const [status, setStatus] = useState<DeployStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { deploy } = useDeploy()

  // Calculate delay seconds from scheduled timestamps
  const calculateDelaySeconds = (
    hops: { scheduledAt: string }[]
  ): { recipient: string; delaySeconds: string }[] => {
    return hops.map((hop, index, arr) => {
      if (index === 0) {
        return {
          recipient: (hop as any).recipient,
          delaySeconds: '0',
        }
      }
      const prevTime = new Date(arr[index - 1].scheduledAt).getTime()
      const currTime = new Date(hop.scheduledAt).getTime()
      const delayMs = Math.max(0, currTime - prevTime)
      return {
        recipient: (hop as any).recipient,
        delaySeconds: Math.floor(delayMs / 1000).toString(),
      }
    })
  }

  // Format time display
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Computed values
  const firstHopTime = useMemo(() => {
    if (!route?.hops?.length) return null
    return formatTime(route.hops[0].scheduledAt)
  }, [route])

  const lastHopTime = useMemo(() => {
    if (!route?.hops?.length) return null
    return formatTime(route.hops[route.hops.length - 1].scheduledAt)
  }, [route])

  const handleDeployNow = async () => {
    if (!route) return

    setStatus('deploying')
    setErrorMessage(null)

    try {
      const deployData = {
        routeId: route.routeId,
        databaseId: route.id,
        routes: calculateDelaySeconds(route.hops),
        hopAmount: route.hopAmountRaw,
        splMint: route.tokenMint || undefined,
      }

      setStatus('confirming')
      await deploy(deployData, route.tokenType)
      setStatus('success')

      // Brief delay before calling success callback
      setTimeout(() => {
        onDeploySuccess()
      }, 1500)
    } catch (error) {
      console.error('Deploy error:', error)
      setStatus('error')
      setErrorMessage(
        error instanceof Error ? error.message : 'Deployment failed'
      )
    }
  }

  const handleRetry = () => {
    setStatus('idle')
    setErrorMessage(null)
  }

  if (!isOpen || !route) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={status === 'idle' || status === 'error' ? onClose : undefined}
      />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-md mx-4 rounded-3xl bg-[var(--chinese-black-800)] border border-[var(--white-100-transparency-10)] p-6"
        style={{
          boxShadow:
            '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0px 1px 0px var(--white-100-transparency-08)',
        }}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-medium text-[var(--white-100)] mb-1">
            {status === 'success'
              ? 'Route Deployed!'
              : status === 'error'
              ? 'Deployment Failed'
              : 'Deploy Your Route'}
          </h2>
          {route.name && status === 'idle' && (
            <p className="text-sm text-[var(--philippine-gray-500)]">
              {route.name}
            </p>
          )}
        </div>

        {/* Content based on status */}
        {status === 'idle' && (
          <>
            {/* Route Summary */}
            <div className="bg-[var(--eerie-black-700)] rounded-2xl p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-[var(--philippine-gray-500)]">
                  Amount
                </span>
                <span className="text-[var(--white-100)] font-medium">
                  {route.hopAmountTokens} {route.tokenSymbol || route.tokenType}
                </span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-[var(--philippine-gray-500)]">
                  Hops
                </span>
                <span className="text-[var(--white-100)] font-medium">
                  {route.hops.length}
                </span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-[var(--philippine-gray-500)]">
                  First Hop
                </span>
                <span className="text-[var(--white-100)] font-medium">
                  {firstHopTime}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--philippine-gray-500)]">
                  Completion
                </span>
                <span className="text-[var(--laser-lemon-500)] font-medium">
                  {lastHopTime}
                </span>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-12 rounded-3xl border border-[var(--white-100-transparency-20)] text-[var(--white-100)] font-medium transition hover:bg-[var(--white-100-transparency-05)]"
              >
                Deploy Later
              </button>
              <button
                type="button"
                onClick={handleDeployNow}
                className="flex-1 h-12 rounded-3xl bg-[var(--laser-lemon-500)] text-[var(--black-900)] font-medium transition hover:brightness-95"
              >
                Deploy Now
              </button>
            </div>
          </>
        )}

        {(status === 'deploying' || status === 'confirming') && (
          <div className="py-8 text-center">
            {/* Loading spinner */}
            <div className="w-12 h-12 mx-auto mb-4 border-4 border-[var(--laser-lemon-500)] border-t-transparent rounded-full animate-spin" />
            <p className="text-[var(--white-100)] font-medium mb-1">
              {status === 'deploying'
                ? 'Please sign the transaction...'
                : 'Confirming transaction...'}
            </p>
            <p className="text-sm text-[var(--philippine-gray-500)]">
              {status === 'deploying'
                ? 'Check your wallet for the signing request'
                : 'Waiting for blockchain confirmation'}
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="py-8 text-center">
            {/* Success checkmark */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--laser-lemon-500)] flex items-center justify-center">
              <svg
                className="w-8 h-8 text-[var(--black-900)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-[var(--white-100)] font-medium mb-1">
              Your route is now live!
            </p>
            <p className="text-sm text-[var(--philippine-gray-500)]">
              Hops will execute according to schedule
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="py-4">
            {/* Error icon */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <p className="text-[var(--white-100)] font-medium mb-1 text-center">
              Deployment failed
            </p>
            {errorMessage && (
              <p className="text-sm text-red-400 text-center mb-6 px-2">
                {errorMessage}
              </p>
            )}

            {/* Retry buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-12 rounded-3xl border border-[var(--white-100-transparency-20)] text-[var(--white-100)] font-medium transition hover:bg-[var(--white-100-transparency-05)]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleRetry}
                className="flex-1 h-12 rounded-3xl bg-[var(--laser-lemon-500)] text-[var(--black-900)] font-medium transition hover:brightness-95"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
