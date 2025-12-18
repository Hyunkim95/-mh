import React, { useEffect, useMemo } from 'react'
import { Card } from '../components/Card'
import { NavBar } from '../components/NavBar'
import { useSolanaAuth } from '../hooks/useSolanaAuth'
import { router } from '../router'
import { useWallet } from '@solana/wallet-adapter-react'
import type { WalletName } from '@solana/wallet-adapter-base'
import { ReactComponent as CheckIcon } from '../../assets/icons/check-icon.svg'

export const Login: React.FC = () => {
  const {
    wallets,
    wallet: currentWallet,
    select,
    connect,
    publicKey,
    connecting,
    connected,
  } = useWallet()
  const { authenticate, userData, isPending, isLoading } = useSolanaAuth()

  // Navigate when authenticated
  useEffect(() => {
    if (userData && publicKey) {
      router.navigate({ to: '/my-assets' })
    }
  }, [userData, publicKey])

  const desiredWallets = useMemo(() => {
    return wallets.map(w => ({
      label: w.adapter.name,
      wallet: w,
    }))
  }, [wallets])

  const shortAddress = (addr?: string) =>
    addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : ''

  const handleSelectWallet = async (name: WalletName | undefined) => {
    if (!name) return
    try {
      select(name)
      await connect()
    } catch {
      // Intentionally swallow to keep UI calm; adapter handles toasts
    }
  }

  const isSelectedTile = (label: string) => {
    return currentWallet?.adapter?.name
      ?.toLowerCase()
      .includes(label.toLowerCase())
  }

  const loginCardBody = (
    <div className='flex flex-col h-full'>
      <div className='text-center mb-12'>
        <h2 className='not-italic font-medium text-2xl leading-7 text-center mb-2'>
          Connect Wallet
        </h2>
        <p className='not-italic font-light text-base leading-4 text-center text-[var(--white-100)]'>
          Select the wallet you’d like to connect
        </p>
      </div>

      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
        {desiredWallets.map(({ label, wallet }) => {
          const selected = isSelectedTile(label) && !!publicKey
          const disabled = !wallet
          const icon = wallet?.adapter?.icon
          const address =
            selected && publicKey ? shortAddress(publicKey.toString()) : ''
          return (
            <button
              key={label}
              type='button'
              disabled={disabled || connecting}
              onClick={() => handleSelectWallet(wallet?.adapter?.name)}
              className={`w-full rounded-3xl px-5 py-4 flex items-center gap-4 border border-[var(--dark-charcoal-500-transparency-58)] transition ${
                selected
                  ? 'bg-[var(--chinese-black-800)] border-[var(--chinese-black-800))]'
                  : 'bg-[var(--dark-gunmetal-500)] hover:bg-[var(--chinese-black-800)] hover:border-[var(--chinese-black-800))]'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              style={{
                boxShadow: 'inset 0px 1px 0px var(--white-100-transparency-08)',
              }}
            >
              <div className='h-12 w-12 flex items-center justify-center rounded-lg overflow-hidden'>
                <img
                  src={icon}
                  alt={`${label}-icon`}
                  className='h-full w-full object-contain'
                />
              </div>

              <div className='flex-1 text-left'>
                <div className='flex flex-row items-center justify-between w-full'>
                  <div className='not-italic font-medium text-sm leading-4 text-[var(--white-100)]'>
                    {label}
                  </div>
                  {selected ? (
                    <div className='h-3 w-3 flex items-center justify-start'>
                      <CheckIcon className='h-full w-full object-contain' />
                    </div>
                  ) : null}
                </div>
                {address ? (
                  <div className='not-italic font-light text-sm leading-4 text-[var(--white-100)] mt-2'>
                    {address}
                  </div>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
  
  const loadingBody = (
    <div className='flex flex-col h-full justify-center items-center gap-6'>
      <div className='loader-bar' />
      <div className='not-italic font-light text-base leading-4 text-center text-[var(--white-100)]'>
        {isLoading
          ? <img
            src="https://i.gifer.com/ZZ5H.gif"
            alt="loading"
            className="w-12 h-12"
          />
          : 'Connecting to wallet...'}
      </div>
    </div>
  )

  const loginCardFooter = (
    <div className='flex items-center justify-between gap-6'>
      <div className='not-italic font-light text-xs leading-4 text-[var(--white-100-transparency-58)] w-[210px]'>
        By connecting your wallet, you agree to Multihopper’s{' '}
        <a
          href='https://www.google.com'
          target='_blank'
          rel='noopener noreferrer'
          className='text-[var(--corn-yellow-500)] hover:underline'
        >
          Terms
        </a>{' '}
        <span className='text-[var(--corn-yellow-500)]'>& </span>
        <a
          href='https://www.google.com'
          target='_blank'
          rel='noopener noreferrer'
          className='text-[var(--corn-yellow-500)] hover:underline'
        >
          Privacy Policy
        </a>
      </div>
      <button
        type='button'
        onClick={() => authenticate()}
        disabled={!connected || !publicKey || isPending || isLoading}
        className={`flex items-center justify-center rounded-3xl text-[var(--black-900)] not-italic font-semibold text-base leading-5 text-center px-6 py-3 w-56 transition ${
          connected && publicKey && !isPending && !isLoading
            ? 'bg-[var(--corn-yellow-500)] hover:brightness-95'
            : 'bg-[var(--corn-yellow-500-transparency-30)] cursor-not-allowed'
        }`}
      >
        {isPending ? 'Signing...' : 'Login'}
      </button>
    </div>
  )

  return (
    <div className='min-h-screen text-[var(--white-100)] flex flex-col items-center gap-9 w-full relative'>
      <div className='min-h-screen flex w-full fixed'>
        <div className='app-gradient-bg'>
          <div className='ellipse-bg-one' />
          <div className='ellipse-bg-two' />
        </div>
      </div>
      <NavBar />
      <Card
        cardClasses={{
          mainCardContainer: 'px-20 pt-28 pb-16',
          cardBodyContainer: 'flex flex-col justify-center',
        }}
        cardBody={isLoading||isPending ? loadingBody : loginCardBody}
        cardFooter={loginCardFooter}
        cardHeight={'617px'}
      />
    </div>
  )
}

export default Login
