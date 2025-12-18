import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  TokenConfigInput,
  HumanReadableTokenConfigInput,
  convertHumanReadableToTokenConfigInput,
} from '../../types/tokenConfig'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { getMint } from '@solana/spl-token'
import { trpc } from '../../trpc'

export interface AdminTokenConfigFormProps {
  type: 'SPL' | 'SOL'
  creator: string
  feeTreasury: string
  isUpdate?: boolean
  onSubmit: (data: { address: string; tokenConfig: TokenConfigInput }) => void
  isLoading?: boolean
  error?: string
  tokenDecimals?: number
  initialValues?: {
    address?: string
    minTransferAmount?: string
    feePercentage?: string
    feeTreasury?: string
    maxHops?: string
    maxDelayHours?: string
    timelockHours?: string
    flatFeeSol?: string
  }
}

const inputBase =
  'w-full h-[52px] rounded-2xl bg-[var(--chinese-black-500)] border px-5 text-white placeholder-[var(--white-100-transparency-30)] outline-none shadow-[inset_0_1px_0_var(--white-100-transparency-06)] border-[var(--white-100-transparency-10)]'
const labelBase =
  'not-italic font-medium text-base leading-4 text-[var(--white-100)] mb-2'
const helpTextBase = 'text-xs text-[var(--white-100-transparency-60)] mt-1'
const groupBase = 'flex flex-col gap-2'

export const AdminTokenConfigForm: React.FC<AdminTokenConfigFormProps> = ({
  type,
  creator,
  feeTreasury,
  isUpdate = false,
  onSubmit,
  isLoading = false,
  error,
  tokenDecimals = 6,
  initialValues,
}) => {
  const [address, setAddress] = useState(initialValues?.address || creator)
  const [detectedDecimals, setDetectedDecimals] =
    useState<number>(tokenDecimals)
  const [isDetectingDecimals, setIsDetectingDecimals] = useState(false)
  const [decimalsError, setDecimalsError] = useState<string>('')
  const [inputMode, setInputMode] = useState<'select' | 'manual'>(
    initialValues?.address ? 'manual' : 'select'
  )
  const [selectedTokenId, setSelectedTokenId] = useState<string>(
    initialValues?.address || ''
  )
  const { connection } = useConnection()

  const { data: tokenAccounts, isLoading: isLoadingTokens } =
    trpc.tokens.getTokenAccounts.useQuery(undefined, {
      enabled: type === 'SPL',
    })

  const [humanReadableConfig, setHumanReadableConfig] =
    useState<HumanReadableTokenConfigInput>({
      minTransferAmount: initialValues?.minTransferAmount || '0.001',
      feePercentage: initialValues?.feePercentage || '5',
      feeTreasury: initialValues?.feeTreasury || feeTreasury,
      maxHops: initialValues?.maxHops || '5',
      maxDelayHours: initialValues?.maxDelayHours || '1',
      timelockHours: initialValues?.timelockHours || '0',
      flatFeeSol: initialValues?.flatFeeSol || '0.001',
    })

  useEffect(() => {
    const detectDecimals = async () => {
      if (type !== 'SPL' || !address || !connection) {
        setDetectedDecimals(type === 'SOL' ? 9 : 6)
        return
      }
      try {
        setIsDetectingDecimals(true)
        setDecimalsError('')
        const mintPublicKey = new PublicKey(address)
        const mintInfo = await getMint(connection, mintPublicKey)
        setDetectedDecimals(mintInfo.decimals)
      } catch (error) {
        setDecimalsError('Could not detect token decimals. Using default (6).')
        setDetectedDecimals(6)
      } finally {
        setIsDetectingDecimals(false)
      }
    }
    const timeoutId = setTimeout(detectDecimals, 500)
    return () => clearTimeout(timeoutId)
  }, [address, type, connection])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const tokenConfig = convertHumanReadableToTokenConfigInput(
        humanReadableConfig,
        detectedDecimals
      )
      onSubmit({ address, tokenConfig })
    },
    [address, humanReadableConfig, detectedDecimals, onSubmit]
  )

  const handleConfigChange = (
    field: keyof HumanReadableTokenConfigInput,
    value: string
  ) => {
    setHumanReadableConfig(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleTokenSelect = (tokenId: string) => {
    setSelectedTokenId(tokenId)
    setAddress(tokenId)
  }

  const buttonLabel = useMemo(() => {
    if (isLoading) return isUpdate ? 'Updating...' : 'Creating...'
    if (type === 'SPL' && isDetectingDecimals) return 'Detecting decimals...'
    return isUpdate ? 'Update Token Config' : `Initialize ${type} Token Config`
  }, [isUpdate, type, isLoading, isDetectingDecimals])

  return (
    <form
      onSubmit={handleSubmit}
      className='flex flex-col bg-[var(--chinese-black-800)] rounded-3xl p-6 border border-[var(--white-100-transparency-05)] gap-4'
      style={{ boxShadow: 'inset 0px 1px 0px rgba(255,255,255,0.08)' }}
    >
      <div className='mb-1'>
        <h2 className='not-italic font-medium text-xl leading-6 text-[var(--white-100)]'>
          Initialize {type} Token Config
        </h2>
      </div>

      <div className={groupBase}>
        <label className={labelBase}>
          {type === 'SPL' ? 'SPL Token' : 'Creator Address'}
        </label>
        {type === 'SPL' ? (
          <div className='flex flex-col gap-3'>
            <div className='flex gap-2'>
              <button
                type='button'
                onClick={() => setInputMode('select')}
                className={`rounded-2xl px-3 py-2 text-sm ${
                  inputMode === 'select'
                    ? 'bg-[var(--laser-lemon-500)] text-black'
                    : 'bg-[var(--dark-jungle-green-500)] text-white'
                }`}
              >
                Select from Wallet
              </button>
              <button
                type='button'
                onClick={() => setInputMode('manual')}
                className={`rounded-2xl px-3 py-2 text-sm ${
                  inputMode === 'manual'
                    ? 'bg-[var(--laser-lemon-500)] text-black'
                    : 'bg-[var(--dark-jungle-green-500)] text-white'
                }`}
              >
                Manual Input
              </button>
            </div>

            {inputMode === 'select' ? (
              isLoadingTokens ? (
                <div className='text-sm text-[var(--white-100-transparency-60)]'>
                  Loading wallet tokens…
                </div>
              ) : tokenAccounts && tokenAccounts.length > 0 ? (
                <select
                  value={selectedTokenId}
                  onChange={e => handleTokenSelect(e.target.value)}
                  className={inputBase}
                  required
                  disabled={isUpdate}
                >
                  <option value=''>Select a token from your wallet</option>
                  {tokenAccounts.map((token: any) => (
                    <option key={token.id} value={token.id}>
                      {token?.content?.metadata?.name || 'Unknown'} (
                      {token?.content?.metadata?.symbol || ''}) -{' '}
                      {String(token.id).slice(0, 8)}…
                    </option>
                  ))}
                </select>
              ) : (
                <div className='text-sm text-[var(--white-100-transparency-60)] border border-[var(--white-100-transparency-10)] rounded-2xl px-4 py-3'>
                  No tokens found in wallet. Use manual input instead.
                </div>
              )
            ) : (
              <input
                type='text'
                value={address}
                disabled={isUpdate}
                onChange={e => setAddress(e.target.value)}
                placeholder='Enter SPL token mint address'
                className={inputBase}
                required
              />
            )}

            {type === 'SPL' && (
              <div className='text-xs'>
                {isDetectingDecimals ? (
                  <span className='text-[var(--laser-lemon-500)]'>
                    Detecting token decimals…
                  </span>
                ) : decimalsError ? (
                  <span className='text-[var(--red-pastel-500)]'>
                    {decimalsError}
                  </span>
                ) : (
                  <span className='text-[var(--white-100-transparency-60)]'>
                    Using {detectedDecimals} decimals
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <input
            type='text'
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder='Enter creator wallet address'
            className={inputBase}
            required
          />
        )}
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        <div className={groupBase}>
          <label className={labelBase}>
            Minimum Transfer Amount{' '}
            <span className='text-[var(--white-100-transparency-45)]'>
              ({type === 'SPL' ? 'tokens' : 'SOL'})
            </span>
          </label>
          <input
            type='number'
            step='any'
            value={humanReadableConfig.minTransferAmount}
            onChange={e =>
              handleConfigChange('minTransferAmount', e.target.value)
            }
            placeholder='0.001'
            className={inputBase}
            required
          />
          <p className={helpTextBase}>
            Minimum amount that can be transferred in a single hop
          </p>
        </div>

        <div className={groupBase}>
          <label className={labelBase}>Fee Percentage (%)</label>
          <input
            type='number'
            step='0.01'
            min='0'
            max='100'
            value={humanReadableConfig.feePercentage}
            onChange={e => handleConfigChange('feePercentage', e.target.value)}
            placeholder='5.0'
            className={inputBase}
            required
          />
          <p className={helpTextBase}>Percentage fee charged per transaction</p>
        </div>

        <div className={groupBase}>
          <label className={labelBase}>Fee Treasury Address</label>
          <input
            type='text'
            value={humanReadableConfig.feeTreasury}
            onChange={e => handleConfigChange('feeTreasury', e.target.value)}
            placeholder='Treasury wallet address'
            className={inputBase}
            required
          />
          <p className={helpTextBase}>
            Wallet address where fees will be collected
          </p>
        </div>

        <div className={groupBase}>
          <label className={labelBase}>Maximum Hops</label>
          <input
            type='number'
            min='1'
            max='10'
            value={humanReadableConfig.maxHops}
            onChange={e => handleConfigChange('maxHops', e.target.value)}
            placeholder='5'
            className={inputBase}
            required
          />
          <p className={helpTextBase}>
            Maximum number of hops allowed in a route
          </p>
        </div>

        <div className={groupBase}>
          <label className={labelBase}>
            Maximum Delay <span className='opacity-60'>(hours)</span>
          </label>
          <input
            type='number'
            step='0.1'
            min='0'
            value={humanReadableConfig.maxDelayHours}
            onChange={e => handleConfigChange('maxDelayHours', e.target.value)}
            placeholder='1.0'
            className={inputBase}
            required
          />
          <p className={helpTextBase}>Maximum delay allowed between hops</p>
        </div>

        <div className={groupBase}>
          <label className={labelBase}>
            Timelock Duration <span className='opacity-60'>(hours)</span>
          </label>
          <input
            type='number'
            step='0.1'
            min='0'
            value={humanReadableConfig.timelockHours}
            onChange={e => handleConfigChange('timelockHours', e.target.value)}
            placeholder='0'
            className={inputBase}
            required
          />
          <p className={helpTextBase}>
            Time tokens are locked before being available
          </p>
        </div>

        <div className={groupBase}>
          <label className={labelBase}>
            Flat Fee <span className='opacity-60'>(SOL)</span>
          </label>
          <input
            type='number'
            step='any'
            min='0'
            value={humanReadableConfig.flatFeeSol}
            onChange={e => handleConfigChange('flatFeeSol', e.target.value)}
            placeholder='0.001'
            className={inputBase}
            required
          />
          <p className={helpTextBase}>Fixed fee in SOL per transaction</p>
        </div>
      </div>

      {error && (
        <div className='p-3 rounded-2xl bg-[var(--red-pastel-500)]/10 border border-[var(--red-pastel-500)] text-[var(--red-pastel-500)]'>
          {error}
        </div>
      )}

      <div className='flex justify-end'>
        <button
          type='submit'
          disabled={isLoading || (type === 'SPL' && isDetectingDecimals)}
          className={`rounded-3xl text-[var(--black-900)] not-italic font-medium text-base leading-5 px-6 py-3 shadow-[0_8px_24px_var(--black-900-transparency-45)] transition ${
            isLoading || (type === 'SPL' && isDetectingDecimals)
              ? 'bg-[var(--laser-lemon-500-transparency-30)] cursor-not-allowed'
              : 'bg-[var(--laser-lemon-500)] hover:brightness-95'
          }`}
        >
          {buttonLabel}
        </button>
      </div>
    </form>
  )
}
