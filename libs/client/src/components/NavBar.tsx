import { useWallet } from '@solana/wallet-adapter-react'
import Logo from '../assets/navbar/logo.svg'
import { Button } from './Button'
import Wallet from '../assets/navbar/connected-wallet.svg'
import LogOutIcon from '../assets/icons/log-out-icon.svg'
import { useSolanaAuth } from '../hooks/useSolanaAuth'
import { router } from '../router'
import { useRouterState } from '@tanstack/react-router'

export const NavBar = () => {
  const { publicKey } = useWallet()
  const { logout, userData } = useSolanaAuth()
  const isAdmin = userData?.role === 'admin'
  // Make pathname reactive to route changes
  const pathname = useRouterState({
    select: s => s.location.pathname,
  })
  const isDashboardActive = pathname.startsWith('/admin/multihopper')
  const isMyAssetsActive = pathname.startsWith('/my-assets')

  return (
    <div className='w-full flex flex-row justify-between pt-6 sm:pt-11 px-4 sm:px-20 z-50 relative'>
      <div className='flex flex-row justify-center items-center gap-2 sm:gap-4'>
        <button
          onClick={() => router.navigate({ to: '/' })}
          className='flex flex-row items-center gap-2 sm:gap-4 hover:opacity-80 transition-opacity cursor-pointer'
        >
          <img src={Logo} alt='Logo' className='w-6 sm:w-8 h-6 sm:h-8 object-contain' />
          <h1 className='text-base sm:text-xl font-bold text-[var(--white-100)]'>
            MultiHopper
          </h1>
        </button>
        {isAdmin && (
          <div className='hidden md:flex flex-row items-center gap-3 ml-4'>
            <div className='max-h-[46px]'>
              <Button
                variant='secondary'
                className={
                  isDashboardActive
                    ? '!bg-[var(--white-100)] !text-[var(--black-900)]'
                    : ''
                }
                onClick={() => router.navigate({ to: '/admin/multihopper' })}
              >
                Dashboard
              </Button>
            </div>
            <div className='max-h-[46px]'>
              <Button
                variant='secondary'
                className={
                  isMyAssetsActive
                    ? '!bg-[var(--white-100)] !text-[var(--black-900)]'
                    : ''
                }
                onClick={() => router.navigate({ to: '/my-assets' })}
              >
                My Assets
              </Button>
            </div>
          </div>
        )}
      </div>
      {publicKey && (
        <div className='space-x-2 sm:space-x-6 flex flex-row max-h-[46px]'>
          <Button
            onClick={() => console.log('secondary pressed')}
            variant='secondary'
            className='!px-3 sm:!px-4'
          >
            <div className='flex flex-row gap-2 justify-center items-center'>
              <img src={Wallet} className='w-4 h-4' />

              {publicKey.toString().slice(0, 4) +
                '...' +
                publicKey.toString().slice(-4)}
            </div>
          </Button>
          <Button
            onClick={async () => {
              await logout()
              router.navigate({ to: '/login' })
            }}
            variant='icon'
          >
            <img src={LogOutIcon} className='w-4 sm:w-5 h-4 sm:h-5' />
          </Button>
        </div>
      )}
    </div>
  )
}
