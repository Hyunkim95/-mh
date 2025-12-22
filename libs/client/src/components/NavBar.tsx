import { useWallet } from '@solana/wallet-adapter-react'
import Logo from '../assets/navbar/logo.svg'
import { Button } from './Button'
import Wallet from '../assets/navbar/connected-wallet.svg'
import LogOutIcon from '../assets/icons/log-out-icon.svg'
import { useSolanaAuth } from '../hooks/useSolanaAuth'
import { router } from '../router'
import {  useRouterState } from '@tanstack/react-router'

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

  function goToHome() {
    router.navigate({ to: '/' });
  }

  return (
    <div className='w-full flex flex-row justify-between pt-11 px-20 z-50 relative'>
      <div className='flex flex-row justify-center items-center gap-4'>
        <img src={Logo} alt='Logo' className='w-8 h-8 object-contain cursor-pointer' onClick={goToHome} />
        <h1 className='text-xl font-bold text-[var(--white-100)] cursor-pointer' onClick={goToHome}>
          MultiHopper
        </h1>
        {isAdmin && (
          <div className='flex flex-row items-center gap-3 ml-4'>
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
        <div className='space-x-6 flex flex-row max-h-[46px]'>
          <Button
            onClick={() => console.log('secondary pressed')}
            variant='secondary'
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
            <img src={LogOutIcon} className='w-5 h-5' />
          </Button>
        </div>
      )}
    </div>
  )
}
