import React, { useState } from 'react'
import { trpc } from '../../trpc'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { RouteDetailView } from '../RouteDetailView'
import toast from 'react-hot-toast'
import { TimestampHopInput } from '../../types/route'
import { useWalletChangeEffect } from '../../hooks/useWalletChangeEffect'
import { Transaction } from '@solana/web3.js'
import { useSolanaAuth } from '../../hooks/useSolanaAuth'

interface Route {
  id: number
  routeId: number
  name?: string | null
  description?: string | null
  tokenType: string
  tokenMint?: string | null
  hopAmountTokens: string
  hopAmountRaw: string
  hops?: Array<{
    recipient: string
    scheduledAt: string
    delayMinutes?: number
    delaySeconds?: number
    status?: 'completed' | 'active' | 'upcoming'    
  }>
  creator: string
  status: string
  createdAt: string
  deployedAt?: string | null
  deploymentTxHash?: string | null
  routeConfigPda?: string | null
  canDeploy: boolean
  deploymentStatus: 'draft' | 'deploying' | 'deployed' | 'failed'
}

export const AdminHopsTab: React.FC = () => {
  const { userData } = useSolanaAuth()
  const { publicKey, sendTransaction } = useWallet()
  const { connection } = useConnection()
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null)
  const [showRouteDetail, setShowRouteDetail] = useState(false)

  useWalletChangeEffect({
    onWalletChange: () => {
      setSelectedRouteId(null)
      setShowRouteDetail(false)
    },
    showToast: false,
    invalidateQueries: false,
  })

  const {
    data: routesData,
    isLoading,
    refetch,
  } = trpc.routes.getByCreator.useQuery(
    { creator: userData?.publicKey ?? '' },
    { enabled: !!userData?.publicKey }
  )

  const initializeRoute = trpc.contract.initializeRoute.useMutation()
  const initializeRouteSOL = trpc.contract.initializeRouteSOL.useMutation()
  const markDeployed = trpc.routes.markDeployed.useMutation()

  const routes = routesData?.data ?? []

  const handleViewRoute = (routeId: number) => {
    setSelectedRouteId(routeId)
    setShowRouteDetail(true)
  }

  const handleBackToList = () => {
    setShowRouteDetail(false)
    setSelectedRouteId(null)
  }

  const handleDeploy = async (route: Route) => {
    if (!publicKey || !sendTransaction) {
      toast.error('Please connect your wallet')
      return
    }
    try {
      toast.loading('Preparing deployment transaction...', { id: 'deploy' })
      const hopsArray = Array.isArray(route.hops) ? route.hops : []
      const formattedHops = hopsArray.map((hop: any) => ({
        recipient: hop.recipient,
        delaySeconds: hop.delaySeconds,
      }))
      let transactionSignature
      if (route.tokenType === 'SPL') {
        if (!route.tokenMint) {
          throw new Error('SPL mint address is required for SPL routes')
        }
        transactionSignature = await initializeRoute.mutateAsync({
          routeId: route.routeId,
          routes: formattedHops,
          hopAmount: route.hopAmountRaw,
          creator: publicKey.toBase58(),
          splMint: route.tokenMint,
        })
      } else {
        transactionSignature = await initializeRouteSOL.mutateAsync({
          routeId: route.routeId,
          routes: formattedHops,
          hopAmount: route.hopAmountRaw,
          creator: publicKey.toBase58(),
          splMint: 'So11111111111111111111111111111111111111112',
        })
      }
      toast.loading('Please sign the transaction...', { id: 'deploy' })
      const transaction = Transaction.from(
        Buffer.from(transactionSignature.data.transaction, 'base64')
      )
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: true,
      })
      toast.loading('Confirming transaction...', { id: 'deploy' })
      const latestBlockhash = await connection.getLatestBlockhash()
      const confirmation = await connection.confirmTransaction(
        {
          signature: signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        'confirmed'
      )
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`)
      }
      await markDeployed.mutateAsync({
        id: route.id,
        creator: publicKey.toBase58(),
        deploymentTxHash: signature,
      })
      toast.success(
        `${
          route.tokenType
        } Route deployed successfully! Signature: ${signature.slice(0, 8)}...`,
        { id: 'deploy' }
      )
      refetch()
    } catch (error) {
      toast.error(
        `${route.tokenType} Route deployment failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        { id: 'deploy' }
      )
    }
  }

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      draft: 'bg-white/10 text-white',
      deploying: 'bg-yellow-500/20 text-yellow-300',
      deployed: 'bg-green-500/20 text-green-300',
      failed: 'bg-red-500/20 text-red-300',
    }
    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${
          statusColors[status] || statusColors.draft
        }`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  if (!publicKey) {
    return (
      <div className='text-center py-12 text-[var(--white-100-transparency-60)]'>
        Please connect your wallet to view your routes.
      </div>
    )
  }

  if (showRouteDetail && selectedRouteId !== null) {
    const selectedRoute = routes.find(r => r.id === selectedRouteId)
    const convertedRoute = selectedRoute
      ? {
          ...selectedRoute,
          hops: selectedRoute.hops?.map(hop => ({
            recipient: hop.recipient,
            scheduledAt: hop.scheduledAt,
          })) as TimestampHopInput[],
        }
      : undefined
    return (
      <RouteDetailView
        route={convertedRoute}
        onBack={handleBackToList}
        onRouteUpdate={refetch}
      />
    )
  }

  return (
    <div className='rounded-3xl border border-[var(--white-100-transparency-08)] bg-[var(--chinese-black-800)] overflow-hidden'>
      <div className='p-4 flex justify-between items-center'>
        <h2 className='text-xl text-white'>Your Hops</h2>
        <div className='text-sm text-[var(--white-100-transparency-60)]'>
          {routes.length} route{routes.length !== 1 ? 's' : ''} found
        </div>
      </div>
      {isLoading ? (
        <div className='text-center py-12 text-[var(--white-100-transparency-60)]'>
          Loading your routes…
        </div>
      ) : !routes.length ? (
        <div className='text-center py-12 text-[var(--white-100-transparency-60)]'>
          No routes created yet.
        </div>
      ) : (
        <div className='overflow-x-auto'>
          <table className='min-w-full text-sm'>
            <thead className='bg-[var(--eerie-black-700)] text-[var(--white-100-transparency-70)]'>
              <tr>
                {[
                  'Route',
                  'Token',
                  'Hop Amount',
                  'Hops',
                  'Status',
                  'Created',
                  'Actions',
                ].map(h => (
                  <th key={h} className='px-6 py-3 text-left font-medium'>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y divide-[var(--white-100-transparency-06)] text-[var(--white-100-transparency-80)]'>
              {routes.map(route => (
                <tr key={route.id} className='hover:bg-white/5'>
                  <td className='px-6 py-4'>
                    <div className='flex flex-col'>
                      <div className='text-[var(--white-100)]'>
                        {route.name || `Route #${route.routeId}`}
                      </div>
                      {route.description && (
                        <div className='text-xs text-[var(--white-100-transparency-60)] truncate max-w-xs'>
                          {route.description}
                        </div>
                      )}
                      <div className='text-xs text-[var(--white-100-transparency-45)]'>
                        ID: {route.routeId}
                      </div>
                    </div>
                  </td>
                  <td className='px-6 py-4'>{route.tokenType}</td>
                  <td className='px-6 py-4'>
                    {route.hopAmountTokens} {route.tokenType}
                  </td>
                  <td className='px-6 py-4'>
                    {Array.isArray(route.hops) ? route.hops.length : 0}
                  </td>
                  <td className='px-6 py-4'>{getStatusBadge(route.status)}</td>
                  <td className='px-6 py-4'>
                    {new Date(route.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className='px-6 py-4'>
                    <div className='flex gap-2'>
                      <button
                        onClick={() => handleViewRoute(route.id)}
                        className='rounded-2xl px-3 py-1 bg-white/10 text-white'
                      >
                        View
                      </button>
                      {route.canDeploy && (
                        <button
                          onClick={() => handleDeploy(route)}
                          className='rounded-2xl px-3 py-1 bg-[var(--laser-lemon-500)] text-black'
                        >
                          Deploy
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
