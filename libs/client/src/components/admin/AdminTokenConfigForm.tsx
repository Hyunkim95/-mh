import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  TokenConfigInput,
  HumanReadableTokenConfigInput,
  convertHumanReadableToTokenConfigInput,
} from '../../types/tokenConfig'

export interface AdminTokenConfigFormProps {
  type: 'SPL' | 'SOL'
  creator: string
  feeTreasury: string
  isUpdate?: boolean
  onSubmit: (data: { tokenConfig: TokenConfigInput }) => void
  isLoading?: boolean
  error?: string
  tokenDecimals?: number
  initialValues?: {
    address?: string
    minTransferAmount?: string
    feeBps?: string
    feeTreasury?: string
    maxHops?: string
    maxDelayHours?: string
    timelockHours?: string
    flatFeeLamport?: string
  }
}

const inputBase =
  'w-full h-[52px] rounded-2xl bg-[var(--chinese-black-500)] border px-5 text-white placeholder-[var(--white-100-transparency-30)] outline-none shadow-[inset_0_1px_0_var(--white-100-transparency-06)] border-[var(--white-100-transparency-10)]'
const labelBase =
  'not-italic font-medium text-base leading-4 text-[var(--white-100)] mb-2'
const helpTextBase = 'text-xs text-[var(--white-100-transparency-60)] mt-1'
const groupBase = 'flex flex-col gap-2'

export const AdminTokenConfigForm: React.FC<AdminTokenConfigFormProps> = ({
  feeTreasury,
  isUpdate = false,
  onSubmit,
  isLoading = false,
  error,
  initialValues,
}) => {
  const [humanReadableConfig, setHumanReadableConfig] =
    useState<HumanReadableTokenConfigInput>({
      minTransferAmount: initialValues?.minTransferAmount || '0.001',
      feeBps: initialValues?.feeBps || '5',
      feeTreasury: initialValues?.feeTreasury || feeTreasury,
      maxHops: initialValues?.maxHops || '5',
      maxDelayHours: initialValues?.maxDelayHours || '0',
      timelockHours: initialValues?.timelockHours || '0',
      flatFeeLamport: initialValues?.flatFeeLamport || '0.001',
    })

    useEffect(() => {
      if (initialValues) {
        setHumanReadableConfig({
          minTransferAmount: initialValues?.minTransferAmount || '0.001',
          feeBps: initialValues?.feeBps || '5',
          feeTreasury: initialValues?.feeTreasury || feeTreasury,
          maxHops: initialValues?.maxHops || '5',
          maxDelayHours: initialValues?.maxDelayHours || '0',
          timelockHours: initialValues?.timelockHours || '0',
          flatFeeLamport: initialValues?.flatFeeLamport || '0.001',
        })
      }
    }, [initialValues])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const tokenConfig = convertHumanReadableToTokenConfigInput(
        humanReadableConfig
      )
      onSubmit({ tokenConfig })
    },
    [humanReadableConfig, onSubmit]
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

  const buttonLabel = useMemo(() => {
    if (isLoading) return isUpdate ? 'Updating...' : 'Creating...'
    return isUpdate ? 'Update Token Config' : `Initialize Token Config`
  }, [isUpdate, isLoading])

  return (
    <form
      onSubmit={handleSubmit}
      className='flex flex-col bg-[var(--chinese-black-800)] rounded-3xl p-6 border border-[var(--white-100-transparency-05)] gap-4'
      style={{ boxShadow: 'inset 0px 1px 0px rgba(255,255,255,0.08)' }}
    >
      <div className='mb-1'>
        <h2 className='not-italic font-medium text-xl leading-6 text-[var(--white-100)]'>
          Initialize Token Config
        </h2>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>

        <div className={groupBase}>
          <label className={labelBase}>Fee Percentage (%)</label>
          <input
            type='number'
            step='0.01'
            min='0'
            max='100'
            value={humanReadableConfig.feeBps}
            onChange={e => handleConfigChange('feeBps', e.target.value)}
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
            Flat Fee <span className='opacity-60'>(SOL)</span>
          </label>
          <input
            type='number'
            step='any'
            min='0'
            value={humanReadableConfig.flatFeeLamport}
            onChange={e => handleConfigChange('flatFeeLamport', e.target.value)}
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
          disabled={isLoading}
          className={`rounded-3xl text-[var(--black-900)] not-italic font-medium text-base leading-5 px-6 py-3 shadow-[0_8px_24px_var(--black-900-transparency-45)] transition ${
            isLoading
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
