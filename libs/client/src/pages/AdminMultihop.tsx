import { useWallet } from '@solana/wallet-adapter-react'
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useInitializeTokenConfig } from '../hooks/useInitializeTokenConfig'
import { trpc } from '../trpc'
import { useSubmitRoute } from '../hooks/useSubmitRoute'
import { useSolanaAuth } from '../hooks/useSolanaAuth'
import { Card } from '../components/Card'
import { NavBar } from '../components/NavBar'
import { AdminTokenConfigForm } from '../components/admin/AdminTokenConfigForm'
import { AdminRouteCreateForm } from '../components/admin/AdminRouteCreateForm'
import { AdminTokenConfigsTable } from '../components/admin/AdminTokenConfigsTable'
import { AdminHopsTab } from '../components/admin/AdminHopsTab'

export const AdminMultihop = () => {
  const { publicKey } = useWallet()
  const navigate = useNavigate()
  const {
    handleIntiaizlizeTokenConfig,
    handleIntiaizlizeTokenConfigSOL,
    tokenConfigPending,
    solTokenConfigPending,
    tokenConfigError,
    solTokenConfigError,
  } = useInitializeTokenConfig({ publicKey })
  const initializeRoute = trpc.contract.initializeRoute.useMutation()
  const initializeRouteSOL = trpc.contract.initializeRouteSOL.useMutation()
  const { data: tokenConfigs, isLoading: tokenConfigsLoading } =
    trpc.tokenConfigs.getTokenConfigs.useQuery()
  const [activeTab, setActiveTab] = useState<
    'token-config' | 'routes' | 'hops'
  >('token-config')

  const handleViewTokenConfig = (config: any) => {
    navigate({
      to: '/token-config/$tokenConfigId',
      params: { tokenConfigId: config.id.toString() },
    })
  }
  const { userData } = useSolanaAuth()
  const { handleRouteSubmit } = useSubmitRoute({ publicKey })

  return (
    <div className='min-h-screen text-[var(--white-100)] flex flex-col items-center gap-9 w-full relative'>
      <div className='min-h-screen flex w-full fixed'>
        <div className='app-gradient-bg'>
          <div className='ellipse-bg-one' />
          <div className='ellipse-bg-two' />
        </div>
      </div>
      <NavBar />

      {/* Tabs */}
      <div className='w-full px-20 relative z-30'>
        <div className='flex items-center gap-2'>
          {[
            { key: 'token-config', label: 'Token Config' },
            { key: 'routes', label: 'Routes' },
            { key: 'hops', label: 'Hops' },
          ].map(t => {
            const isActive = t.key === activeTab
            return (
              <button
                key={t.key}
                type='button'
                onClick={() =>
                  setActiveTab(t.key as 'token-config' | 'routes' | 'hops')
                }
                className={`flex items-center gap-2 rounded-2xl h-[46px] px-4 transition ${
                  isActive
                    ? 'bg-[var(--white-100)] text-[var(--chinese-black-800)]'
                    : 'bg-[var(--eerie-black-700)] text-[var(--white-100)] hover:bg-[var(--white-100-transparency-07)]'
                }`}
              >
                <span className='not-italic font-medium text-base leading-5'>
                  {t.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Content per tab */}
      <div className='w-full px-20 relative z-20'>
        {activeTab === 'token-config' ? (
          <div className='flex flex-col gap-8'>
            <div className='grid justify-items-center grid-cols-1 lg:grid-cols-2 gap-6'>
              <Card
                cardBody={
                  <AdminTokenConfigForm
                    creator={userData?.publicKey || ''}
                    feeTreasury={userData?.publicKey || ''}
                    type='SPL'
                    onSubmit={async data => {
                      await handleIntiaizlizeTokenConfig(data)
                    }}
                    isLoading={tokenConfigPending}
                    error={tokenConfigError?.message}
                  />
                }
                cardHeight={'auto'}
                cardClasses={{
                  mainCardContainer: 'px-6 py-8',
                  cardBodyContainer: 'mb-0 h-auto',
                }}
              />
              <Card
                cardBody={
                  <AdminTokenConfigForm
                    creator={userData?.publicKey || ''}
                    feeTreasury={userData?.publicKey || ''}
                    type='SOL'
                    onSubmit={async data => {
                      await handleIntiaizlizeTokenConfigSOL(data)
                    }}
                    isLoading={solTokenConfigPending}
                    error={solTokenConfigError?.message}
                  />
                }
                cardHeight={'auto'}
                cardClasses={{
                  mainCardContainer: 'px-6 py-8',
                  cardBodyContainer: 'mb-0 h-auto',
                }}
              />
            </div>

            <AdminTokenConfigsTable
              tokenConfigs={tokenConfigs || []}
              loading={tokenConfigsLoading}
              onView={handleViewTokenConfig}
            />
          </div>
        ) : activeTab === 'routes' ? (
          <div className='grid justify-items-center grid-cols-1 lg:grid-cols-2 gap-6'>
            <Card
              cardBody={
                <AdminRouteCreateForm
                  type='SPL'
                  onSubmit={data => handleRouteSubmit(data, 'SPL')}
                  isLoading={initializeRoute.isPending}
                  error={initializeRoute.error?.message}
                />
              }
              cardHeight={'auto'}
              cardClasses={{
                mainCardContainer: 'px-6 py-8',
                cardBodyContainer: 'mb-0 h-auto',
              }}
            />
            <Card
              cardBody={
                <AdminRouteCreateForm
                  type='SOL'
                  onSubmit={data => handleRouteSubmit(data, 'SOL')}
                  isLoading={initializeRouteSOL.isPending}
                  error={initializeRouteSOL.error?.message}
                />
              }
              cardHeight={'auto'}
              cardClasses={{
                mainCardContainer: 'px-6 py-8',
                cardBodyContainer: 'mb-0 h-auto',
              }}
            />
          </div>
        ) : (
          <AdminHopsTab />
        )}
      </div>
    </div>
  )
}
