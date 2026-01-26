import React, { useMemo, useState, useEffect, useCallback } from 'react'
import AddIcon from '../../assets/icons/add-icon.svg'
import ReloadIcon from '../../assets/icons/reload-icon.svg'
import Logo from '../assets/navbar/logo.svg'
import { TokenCard } from '../components/TokenCard'
import { SkeletonCard } from '../components/SkeletonCard'
import { Search } from '../components/Search'
import { Card } from '../components/Card'
import { useNavigate } from '@tanstack/react-router'
import { useAtom } from 'jotai'
import { selectedAssetAtom, type TokenAsset } from '../store/atoms'

// Extended token type with fallback icon support
type TokenWithFallback = TokenAsset & {
  usdValue: string
  fallbackIcon?: string // IPFS URI fallback when CDN fails
}
import { trpc } from '../trpc'
import { NavBar } from '../components/NavBar'
import {
  HeliusAssetLike,
  hasContentFiles,
  hasContentMetadata,
  hasTokenInfo,
} from '../utils/heliusAssets'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { getMint, getAssociatedTokenAddressSync, getAccount } from '@solana/spl-token'
import { TABS } from '../constants/tab'

type Token = TokenWithFallback

export const MyAssets: React.FC = () => {
  const [query, setQuery] = useState('')
  const [activeCriteria, setActiveCriteria] = useState<Array<keyof Token>>([
    'name',
  ])
  const [inputMode, setInputMode] = useState<'search' | 'manual'>('search')
  const [manualAddress, setManualAddress] = useState('')
  const [isValidatingAddress, setIsValidatingAddress] = useState(false)
  const [addressError, setAddressError] = useState('')
  const [manualToken, setManualToken] = useState<Token | null>(null)
  const navigate = useNavigate()
  const [selectedAsset, setSelectedAsset] = useAtom(selectedAssetAtom)
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const [solBalance, setSolBalance] = useState<number>(0)
  const [solPrice, setSolPrice] = useState<number>(0)

  // Fetch only tokens that are both in the user's wallet and configured in Multihopper
  const { data: crossSectionData, isLoading: isLoadingTokens, refetch: refetchTokens } =
    trpc.tokens.crossSectionWithTokenConfigs.useQuery()

  // Mutation to invalidate server-side cache
  const invalidateCacheMutation = trpc.tokens.invalidateCache.useMutation()

  // Placeholder SVG icon as data URL for tokens without images
  const placeholderIcon =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="#1b1c1f"/>
        <circle cx="12" cy="12" r="6" fill="#2a2c31"/>
        <circle cx="12" cy="12" r="3" fill="#3a3d44"/>
      </svg>`
    )

  const [reloadTrigger, setReloadTrigger] = useState(0);
  const handleReloadClick = async () => {
    // Invalidate server-side cache first, then refetch
    try {
      await invalidateCacheMutation.mutateAsync();
    } catch (e) {
      console.error('Failed to invalidate cache:', e);
    }
    // Refetch tokens with fresh data
    refetchTokens();
    // Also trigger SOL balance refresh
    setReloadTrigger((prev) => prev + 1);
  };

  // Fetch SOL balance and price
  useEffect(() => {
    const fetchSolData = async () => {
      if (!publicKey || !connection) {
        setSolBalance(0)
        return
      }
      try {
        const balance = await connection.getBalance(publicKey)
        setSolBalance(balance / LAMPORTS_PER_SOL)

        // Fetch SOL price from CoinGecko
        try {
          const priceResponse = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
          )
          const priceData = await priceResponse.json()
          if (priceData?.solana?.usd) {
            setSolPrice(priceData.solana.usd)
          }
        } catch (priceError) {
          console.error('Error fetching SOL price:', priceError)
        }
      } catch (error) {
        console.error('Error fetching SOL balance:', error)
        setSolBalance(0)
      }
    }
    fetchSolData()
  }, [publicKey, connection, reloadTrigger])

  // Validate and fetch manual token info
  const validateManualAddress = useCallback(
    async (address: string) => {
      if (!address || !connection) {
        setManualToken(null)
        setAddressError('')
        return
      }

      try {
        setIsValidatingAddress(true)
        setAddressError('')
        
        // Validate address format
        const mintPublicKey = new PublicKey(address)
        
        // Get token info from blockchain
        const mintInfo = await getMint(connection, mintPublicKey)
        const tokenATA = await getAssociatedTokenAddressSync(
          mintPublicKey,
          publicKey!,
          false
        );
        const tokenAccountInfo = await getAccount(connection, tokenATA);

        // Create a token object for manual input
        const token: Token = {
          id: address,
          tokenType: 'SPL',
          decimals: mintInfo.decimals,
          icon: placeholderIcon,
          symbol: address.slice(0, 6) + '...',
          name: 'Manual Token',
          amount: Number(tokenAccountInfo.amount / BigInt(10 ** mintInfo.decimals)),
          address: address,
          usdValue: '',
        }
        
        setManualToken(token)
      } catch (error) {
        console.error('Error validating token:', error)
        setAddressError('Invalid token address')
        setManualToken(null)
      } finally {
        setIsValidatingAddress(false)
      }
    },
    [connection, placeholderIcon]
  )

  const normalizedTokens: Token[] = useMemo(() => {
    const items = crossSectionData?.tokens || []
    const splTokens = items.map((t: HeliusAssetLike) => {
      const id: string = t?.id || ''
      const name: string =
        (hasContentMetadata(t) && t.content.metadata?.name) || 'Unknown Token'
      const symbol: string =
        (hasContentMetadata(t) && t.content.metadata?.symbol) || id?.slice(0, 6)
      // Try CDN first, fallback to original URI (often IPFS)
      const cdnUri = hasContentFiles(t) ? t.content.files?.[0]?.cdn_uri : undefined
      const originalUri = hasContentFiles(t) ? t.content.files?.[0]?.uri : undefined
      const icon: string = cdnUri || originalUri || placeholderIcon
      const fallbackIcon: string | undefined = cdnUri && originalUri ? originalUri : undefined
      // Helius often includes token_info with balance/decimals; fallback if absent
      const decimals: number =
        (hasTokenInfo(t) && typeof t.token_info.decimals === 'number'
          ? t.token_info.decimals
          : undefined) ?? 6
      const balanceRaw: number = hasTokenInfo(t)
        ? Number(t.token_info.balance ?? 0)
        : 0
      // Show human readable amount
      const amount: number = balanceRaw / 10 ** decimals

      // Extract price from token_info
      let pricePerToken: number | null = null
      if (hasTokenInfo(t)) {
        // Try price_per_token directly
        if (
          typeof t.token_info.price_per_token === 'number' &&
          t.token_info.price_per_token > 0
        ) {
          pricePerToken = t.token_info.price_per_token
        }
        // Try price_info.price_per_token
        else if (
          t.token_info.price_info &&
          typeof t.token_info.price_info.price_per_token === 'number' &&
          t.token_info.price_info.price_per_token > 0
        ) {
          pricePerToken = t.token_info.price_info.price_per_token
        }
        // Try calculating from price_info.total_price and balance
        else if (
          t.token_info.price_info &&
          typeof t.token_info.price_info.total_price === 'number' &&
          t.token_info.price_info.total_price > 0 &&
          balanceRaw > 0
        ) {
          pricePerToken = t.token_info.price_info.total_price / balanceRaw
        }
      }

      // Calculate USD value if price is available
      let usdValue = ''
      if (pricePerToken && amount > 0) {
        const totalUsd = amount * pricePerToken
        if (totalUsd > 0) {
          usdValue = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 6,
          }).format(totalUsd)
        }
      }

      const tokenAsset: Token = {
        id,
        tokenType: 'SPL',
        decimals,
        icon,
        fallbackIcon, // IPFS fallback when CDN fails
        symbol,
        name,
        amount,
        address: id,
        usdValue,
      }
      return tokenAsset
    })

    // Always add native SOL as the first option
    const solUsdValue = solBalance > 0 && solPrice > 0
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        }).format(solBalance * solPrice)
      : ''

    const solToken: Token = {
      id: 'So11111111111111111111111111111111111111112',
      tokenType: 'SOL',
      decimals: 9,
      icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      symbol: 'SOL',
      name: 'Solana',
      amount: solBalance,
      address: 'So11111111111111111111111111111111111111112',
      usdValue: solUsdValue,
    }

    return [solToken, ...splTokens]
  }, [crossSectionData, solBalance, solPrice])

  const handleConfigureRoute = () => {
    if (!selectedAsset) return
    // Encode asset data as base64 to pass in URL
    const assetData = btoa(JSON.stringify(selectedAsset))
    navigate({ to: '/configure-hops', search: { asset: assetData } })
  }

  // Compute filtered list based on query and token name
  const filteredTokens = useMemo(() => {
    const baseTokens = inputMode === 'manual' && manualToken 
      ? [manualToken]
      : normalizedTokens
      
    if (inputMode === 'manual') return baseTokens
    
    const q = query.trim().toLowerCase()
    if (!q) return baseTokens
    const keys = (activeCriteria.length ? activeCriteria : ['name']) as Array<
      keyof Token
    >
    return baseTokens.filter((t: Token) =>
      keys.some((k: keyof Token) => String(t[k]).toLowerCase().includes(q))
    )
  }, [query, normalizedTokens, activeCriteria, inputMode, manualToken])

  const myAssetsCardBody = (
    <div
      className='flex flex-col bg-[var(--chinese-black-800)] rounded-3xl pt-8 px-9 pb-9 border border-[var(--white-100-transparency-05)]'
      style={{
        boxShadow: 'inset 0px 1px 0px var(--white-100-transparency-08)',
      }}
    >
      <div className='mb-6'>
        <h2 className='text-xl font-semibold'>Select Token</h2>
        <p className='text-sm text-[var(--philippine-gray-500)]'>
          Choose which token you'd like to send through a new route
        </p>
      </div>

      {/* Mode Toggle */}
      <div className='flex gap-2 mb-4'>
        <button
          type='button'
          onClick={() => {
            setInputMode('search')
            setManualToken(null)
            setManualAddress('')
            setAddressError('')
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            inputMode === 'search'
              ? 'bg-[var(--laser-lemon-500)] text-black'
              : 'bg-[var(--white-100-transparency-10)] text-[var(--philippine-gray-500)] hover:bg-[var(--white-100-transparency-15)]'
          }`}
        >
          Search Wallet
        </button>
        <button
          type='button'
          onClick={() => setInputMode('manual')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            inputMode === 'manual'
              ? 'bg-[var(--laser-lemon-500)] text-black'
              : 'bg-[var(--white-100-transparency-10)] text-[var(--philippine-gray-500)] hover:bg-[var(--white-100-transparency-15)]'
          }`}
        >
          Manual Input
        </button>
      </div>

      {inputMode === 'search' ? (
        <Search
          query={query}
          onQueryChange={setQuery}
          placeholder='Search tokens'
          criteria={[
            { key: 'name', label: 'Name' },
            { key: 'symbol', label: 'Symbol' },
          ]}
          activeCriteria={activeCriteria}
          onCriteriaChange={setActiveCriteria}
          showCriteriaChips={false}
        />
      ) : (
        <div className='relative'>
          <input
            type='text'
            value={manualAddress}
            onChange={(e) => {
              const value = e.target.value
              setManualAddress(value)
              if (value.length > 30) {
                validateManualAddress(value)
              }
            }}
            placeholder='Enter SPL token mint address'
            className='w-full px-4 py-3 bg-[var(--white-100-transparency-10)] border border-[var(--white-100-transparency-10)] rounded-lg text-[var(--white-100)] placeholder:text-[var(--philippine-gray-500)] focus:outline-none focus:border-[var(--laser-lemon-500)] transition'
          />
          {isValidatingAddress && (
            <div className='absolute right-3 top-3.5 text-sm text-[var(--philippine-gray-500)]'>
              Validating...
            </div>
          )}
          {addressError && (
            <div className='mt-2 text-sm text-red-500'>
              {addressError}
            </div>
          )}
        </div>
      )}

      <div className='flex flex-col gap-[15px] sm:grid sm:grid-cols-2 sm:gap-4 mt-6 h-auto overflow-x-hidden overflow-y-auto pr-2 relative'>
        {isLoadingTokens ? (
          // Show skeleton cards while loading
          <>
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={`skeleton-${i}`} />
            ))}
            {/* Logo centered over skeleton cards */}
            <div className="bg-[var(--chinese-black-800)] rounded-full absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none h-24 w-24">
              <div className="flex flex-col items-center gap-2">
                <div className="w-[33px] h-[49px]">
                  <img
                    src={Logo}
                    alt="Loading"
                    className="w-full h-full object-contain opacity-80"
                  />
                </div>
                <div className="flex gap-1">
                  <div
                    className="w-1 h-1 rounded-full bg-[var(--white-100-transparency-60)] animate-pulse"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-1 h-1 rounded-full bg-[var(--white-100-transparency-60)] animate-pulse"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-1 h-1 rounded-full bg-[var(--white-100-transparency-60)] animate-pulse"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {filteredTokens.map((token, i) => {
              const isSelected = selectedAsset?.symbol === token.symbol
              return (
                <TokenCard
                  key={`${token.symbol}-${i}`}
                  iconUrl={token.icon}
                  fallbackIconUrl={token.fallbackIcon}
                  symbol={token.symbol}
                  name={token.name}
                  amount={token.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  usdValue={token.usdValue}
                  onClick={() => setSelectedAsset(token)}
                  selected={isSelected}
                />
              )
            })}
            {filteredTokens.length === 0 ? (
              <div className='text-[var(--philippine-gray-500)] text-sm col-span-2'>
                {inputMode === 'manual' 
                  ? 'Enter a valid SPL token address above.'
                  : 'No tokens found. Configure tokens in Multihopper or fund your wallet.'}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )

  const myAssetsCardFooter = (
    <div className='flex flex-row items-center justify-between sm:items-start'>
      {isLoadingTokens && inputMode === 'search' ? (
        <div className='not-italic font-medium text-xs sm:text-sm leading-4 text-[var(--cultured-white-500)]'>
          Loading Wallet...
        </div>
      ) : (
        <div className='not-italic font-medium text-xs sm:text-sm leading-4 text-[var(--cultured-white-500)]'>
          {inputMode === 'manual' 
            ? (isValidatingAddress ? 'Validating token...' : manualToken ? '1 Token ready' : 'Enter token address')
            : `${filteredTokens.length} Tokens found`}
        </div>
      )}

      <button
        type='button'
        onClick={handleConfigureRoute}
        disabled={!selectedAsset}
        title={!selectedAsset ? 'Select a token to continue' : undefined}
        className={`inline-flex items-center gap-2 rounded-full text-black font-semibold px-3 sm:px-6 py-3 shadow-[0_8px_24px_var(--black-900-transparency-45)] transition ${
          selectedAsset
            ? 'bg-[var(--laser-lemon-500)] hover:brightness-95'
            : 'bg-[var(--laser-lemon-500-transparency-30)] cursor-not-allowed'
        }`}
      >
        Configure Route
        <img src={AddIcon} alt='AddIcon' className='h-6 w-6 object-contain' />
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
        cardHeader={{
          tabs: TABS,
          activeKey: 'assets',
          rightSlot: (
            <div
              className='h-10 w-10 rounded-lg bg-[var(--light-silver-500-transparency-04)] flex items-center justify-center cursor-pointer'
              onClick={handleReloadClick}
            >
              <img
                src={ReloadIcon}
                alt='reload-icon'
                className='h-4 w-4 object-contain'
              />
            </div>
          ),
        }}
        cardBody={myAssetsCardBody}
        cardFooter={myAssetsCardFooter}
        cardHeight='auto'
      />
    </div>
  )
}
