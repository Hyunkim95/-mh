import React, { useMemo, useState, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import DownloadIcon from '../../assets/icons/download-icon.svg'
import { useMobileDevice } from '../hooks/useMobileDevice'
import { Card } from '../components/Card'
import { useAtom } from 'jotai'
import {
  hopsConfigAtom,
  type HopConfigItem,
  selectedAssetAtom,
  selectedAmountAtom,
  type TokenAsset,
  routeModeAtom,
  easyRouteConfigAtom,
} from '../store/atoms'
import { useNavigate, useSearch, useRouterState } from '@tanstack/react-router'
import { useSubmitRoute } from '../hooks/useSubmitRoute'
import {
  convertTimestampToRouteInput,
  type TimestampRouteInput,
} from '../types/route'
import { NavBar } from '../components/NavBar'
import toast from 'react-hot-toast'
import { parseHopsCsv, type RowError } from '../utils/csv/parseHopsCsv'

import { AmountSelector } from './configureHops/AmountSelector'
import { HopsSection } from './configureHops/HopsSection'
import { SummaryDisplay } from './configureHops/SummaryDisplay'
import { ModeSelector } from './configureHops/ModeSelector'
import { EasyRouteForm } from './configureHops/EasyRouteForm'
import { EasyRouteSummary } from './configureHops/EasyRouteSummary'
import {
  formatDuration,
  isValidSolanaAddress,
  calculateTotalMinutes,
  hasBlockingWalletErrors,
} from './configureHops/utils'
import { DeployModal, type DeployModalRoute } from '../components/DeployModal'
import { trpc } from '../trpc'
import { TABS } from '../constants/tab'
import { extractErrorMessage } from '../utils/extractErrorMessage'

import ChooseTokenIcon from '../assets/configure-hops/choose-token-icon.svg'
import HopsAndDelaysIcon from '../assets/configure-hops/hops-and-delays-icon.svg'
import FinalDestinationIcon from '../assets/configure-hops/final-destination-icon.svg'
import ThreeLinesIndicator from '../assets/configure-hops/three-lines-indicator.svg'

// Default fee percentage (1% = 0.01) - used as fallback if config fetch fails
const DEFAULT_FEE_PERCENTAGE = 0.01

export const ConfigureHops: React.FC = () => {
  // Tab state - now includes 'mode' step: choose → mode → configure → summary
  const [activeKey, setActiveKey] = useState<string>('choose')
  const [hops, setHops] = useAtom(hopsConfigAtom)
  const [selectedAsset, setSelectedAsset] = useAtom(selectedAssetAtom)
  const [selectedAmount, setSelectedAmount] = useAtom(selectedAmountAtom)
  const [routeMode, setRouteMode] = useAtom(routeModeAtom)
  const [easyRouteConfig, setEasyRouteConfig] = useAtom(easyRouteConfigAtom)
  const navigate = useNavigate()
  const search = useSearch({ from: '/configure-hops' })
  const { publicKey } = useWallet()
  const pathname = useRouterState({
    select: s => s.location.pathname,
  })
  const activeNavTab =
    pathname === '/my-assets'
      ? 'assets'
      : pathname === '/history'
      ? 'history'
      : null
  const { handleRouteSubmit } = useSubmitRoute({ publicKey })
  const createEasyRoute = trpc.easyRoutes.create.useMutation()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: tokenConfigSPL } = trpc.contract.getTokenConfigSPL.useQuery(
    undefined,
    {
      enabled: selectedAsset?.tokenType === 'SPL',
    }
  )
  const { data: tokenConfigSOL } = trpc.contract.getTokenConfigSOL.useQuery(
    { creator: publicKey?.toBase58() ?? '' },
    { enabled: selectedAsset?.tokenType === 'SOL' && !!publicKey }
  )

  // Get fee percentage based on token type (convert from string to decimal)
  const feePercentage = useMemo(() => {
    if (selectedAsset?.tokenType === 'SPL' && tokenConfigSPL?.data?.feeBps) {
      // feeBps is already divided by 10_000 in the backend for SPL
      return parseFloat(tokenConfigSPL.data.feeBps)
    }
    if (selectedAsset?.tokenType === 'SOL' && tokenConfigSOL?.data?.feeBps) {
      // feeBps is raw basis points for SOL, need to divide by 10_000
      return parseFloat(tokenConfigSOL.data.feeBps) / 10_000
    }
    return DEFAULT_FEE_PERCENTAGE
  }, [selectedAsset?.tokenType, tokenConfigSPL, tokenConfigSOL])
  const [formErrors, setFormErrors] = useState<{
    hopRowErrors: Record<number, string | null>
    generalError?: string | null
  }>({ hopRowErrors: {} })
  const [openCustomIdx, setOpenCustomIdx] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [csvErrors, setCsvErrors] = useState<RowError[]>([])
  const [csvShowAll, setCsvShowAll] = useState(false)
  const [routeName, setRouteName] = useState<string>('')
  const [easyRouteWalletError, setEasyRouteWalletError] = useState<
    string | null
  >(null)
  const { isMobile } = useMobileDevice()

  const [showDeployModal, setShowDeployModal] = useState(false)
  const [createdRoute, setCreatedRoute] = useState<DeployModalRoute | null>(
    null
  )

  // ============ Initialize from Query String ============
  React.useEffect(() => {
    const assetParam = (search as any)?.asset
    if (assetParam && !selectedAsset) {
      try {
        const decodedAsset = JSON.parse(atob(assetParam)) as TokenAsset
        setSelectedAsset(decodedAsset)
      } catch (error) {
        console.error('Failed to parse asset from URL:', error)
        navigate({ to: '/my-assets' })
      }
    }
  }, [])

  // ============ State Validation - Navigate back if missing required state ============
  React.useEffect(() => {
    if (activeKey === 'mode') {
      if (!selectedAsset || !selectedAmount || selectedAmount <= 0) {
        setActiveKey('choose')
      }
    }

    if (activeKey === 'configure') {
      if (!selectedAsset || !selectedAmount || selectedAmount <= 0) {
        setActiveKey('choose')
      }
    }

    if (activeKey === 'summary') {
      const hasValidCustomRoute =
        hops.length > 0 &&
        hops.every(
          h =>
            h.wallet.trim().length > 0 &&
            (h.delayMinutes !== null || !!h.scheduledAtUtc)
        )

      const hasValidEasyRoute =
        easyRouteConfig.arrivalTime !== null &&
        easyRouteConfig.destinationWallet.trim().length > 0 &&
        isValidSolanaAddress(easyRouteConfig.destinationWallet) &&
        !easyRouteWalletError

      if (!selectedAsset || !selectedAmount || selectedAmount <= 0) {
        setActiveKey('choose')
        return
      }

      const isRouteValid =
        routeMode === 'easy' ? hasValidEasyRoute : hasValidCustomRoute

      if (!isRouteValid) {
        setActiveKey('configure')
      }
    }
  }, [
    activeKey,
    selectedAsset,
    selectedAmount,
    hops,
    routeMode,
    easyRouteConfig,
    easyRouteWalletError,
  ])

  // ============ File Upload & CSV Handling ============
  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvErrors([])
    setCsvShowAll(false)

    if (!file.name.endsWith('.csv')) {
      setCsvErrors([
        { line: 0, field: 'file', message: 'Select a valid CSV file.' },
      ])
      toast.error('Invalid file. Must be .csv')
      e.target.value = ''
      return
    }

    try {
      const { rows, errors } = await parseHopsCsv(file)
      setCsvErrors(errors || [])

      if ((rows?.length || 0) === 0) {
        toast.error('The CSV does not contain valid rows')
        return
      }

      await loadFileData(rows as HopConfigItem[])
      toast.success(`Imported ${rows.length} hops`)
    } catch (err) {
      console.error(err)
      toast.error('Error processing the CSV')
    } finally {
      e.target.value = ''
    }
  }

  const handleDownloadTemplate = () => {
    const csvContent = `wallet,timeInMinutes
walletA,2
walletB,5
walletC,10`
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'route_template.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // ============ Hop Management ============
  const canAddRow = useMemo(
    () =>
      hops.every(
        h =>
          h.wallet.trim().length > 0 &&
          (h.delayMinutes !== null || !!h.scheduledAtUtc)
      ),
    [hops]
  )

  const addRow = () => {
    if (!canAddRow) return
    setHops([...hops, { wallet: '', delayMinutes: null }])
  }

  const setWallet = (idx: number, wallet: string) => {
    setHops(prev => prev.map((h, i) => (i === idx ? { ...h, wallet } : h)))
  }

  const setDelay = (idx: number, minutes: number) => {
    setHops(prev =>
      prev.map((h, i) =>
        i === idx ? { ...h, delayMinutes: minutes, scheduledAtUtc: null } : h
      )
    )
  }

  const setScheduledAtUtc = (idx: number, utcString: string) => {
    setHops(prev =>
      prev.map((h, i) =>
        i === idx ? { ...h, scheduledAtUtc: utcString, delayMinutes: null } : h
      )
    )
  }

  const removeRow = (idx: number) => {
    setHops(prev => prev.filter((_, i) => i !== idx))
    setFormErrors(prev => {
      const next = { ...prev, hopRowErrors: { ...prev.hopRowErrors } }
      delete next.hopRowErrors[idx]

      // Reindex errors
      const fixed: Record<number, string | null> = {}
      Object.entries(next.hopRowErrors).forEach(([key, value]) => {
        const k = Number(key)
        if (k > idx) fixed[k - 1] = value
        else if (k < idx) fixed[k] = value
      })

      next.hopRowErrors = fixed
      return next
    })
  }

  const validateWallet = async (idx: number, val: string) => {
    if (!val.trim()) {
      setFormErrors(prev => {
        const next = { ...prev, hopRowErrors: { ...prev.hopRowErrors } }
        delete next.hopRowErrors[idx]
        return next
      })
      return
    }

    if (!isValidSolanaAddress(val)) {
      setFormErrors(prev => ({
        ...prev,
        hopRowErrors: {
          ...prev.hopRowErrors,
          [idx]: 'Invalid Solana address',
        },
      }))
      return
    }

    setFormErrors(prev => {
      const next = { ...prev, hopRowErrors: { ...prev.hopRowErrors } }
      delete next.hopRowErrors[idx]
      return next
    })
  }

  const loadFileData = async (hopsArray: HopConfigItem[]) => {
    setHops(hopsArray)
    hopsArray.forEach((hop, i) => {
      if (hop.wallet) validateWallet(i, hop.wallet)
    })
  }

  const handleCustomDateError = (idx: number, errorMsg: string | null) => {
    setFormErrors(prev => {
      const next = { ...prev, hopRowErrors: { ...prev.hopRowErrors } }
      if (errorMsg) {
        next.hopRowErrors[idx] = errorMsg
      } else {
        delete next.hopRowErrors[idx]
      }
      return next
    })
  }

  const handleCustomDateChange = (idx: number, utcString: string) => {
    setScheduledAtUtc(idx, utcString)
    setOpenCustomIdx(null)
  }

  // ============ Choose Tab ============
  const handleBalanceRefreshed = React.useCallback((newBalance: number) => {
    // Update the atom with the fresh on-chain balance and clamp amount if needed
    setSelectedAsset(prev => {
      if (!prev) return prev

      const maxAmount = Math.floor(newBalance * 1e6) / 1e6
      setSelectedAmount(currentAmount => {
        if (currentAmount > 0) {
          return currentAmount > maxAmount ? maxAmount : currentAmount
        }
        return currentAmount
      })

      return { ...prev, amount: newBalance }
    })
  }, [setSelectedAsset, setSelectedAmount])

  const handleInitializeAmount = React.useCallback(() => {
    const maxAmount = parseNumber(selectedAsset?.amount)
    if (
      activeKey === 'choose' &&
      maxAmount > 0 &&
      (!selectedAmount || selectedAmount > maxAmount)
    ) {
      const forty = Math.max(0, Math.round(maxAmount * 0.4 * 1e6) / 1e6)
      setSelectedAmount(forty)
    }
  }, [activeKey, selectedAsset?.amount, selectedAmount, setSelectedAmount])

  React.useEffect(() => {
    handleInitializeAmount()
  }, [handleInitializeAmount])

  const chooseTabBody = (
    <>
      <div className='mb-6'>
        <h2 className='not-italic font-medium text-xl leading-6 text-[var(--white-100)] mb-2'>
          Choose Your Token
        </h2>
        <p className='not-italic font-light text-base leading-5 text-[var(--philippine-gray-500)]'>
          Choose a token to route with Multihopper and set the amount.
        </p>
      </div>
      <AmountSelector
        asset={selectedAsset}
        amount={selectedAmount}
        onAmountChange={setSelectedAmount}
        feePercentage={feePercentage}
        onBalanceRefreshed={handleBalanceRefreshed}
      />
    </>
  )

  // ============ Mode Selection Tab ============
  const modeTabBody = (
    <ModeSelector selectedMode={routeMode} onModeChange={setRouteMode} />
  )

  // ============ Easy Route Handlers ============
  const handleEasyRouteArrivalTimeChange = (date: Date | null) => {
    setEasyRouteConfig(prev => ({ ...prev, arrivalTime: date }))
  }

  const handleEasyRouteHopCountChange = (count: number) => {
    setEasyRouteConfig(prev => ({ ...prev, hopCount: count }))
  }

  const handleEasyRouteDestinationChange = (wallet: string) => {
    setEasyRouteConfig(prev => ({ ...prev, destinationWallet: wallet }))
  }

  const validateEasyRouteWallet = (wallet: string) => {
    if (!wallet.trim()) {
      setEasyRouteWalletError(null)
      return
    }
    if (!isValidSolanaAddress(wallet)) {
      setEasyRouteWalletError('Invalid Solana address')
    } else {
      setEasyRouteWalletError(null)
    }
  }

  // ============ Easy Route Form Tab ============
  const easyRouteTabBody = (
    <EasyRouteForm
      selectedAsset={selectedAsset}
      selectedAmount={selectedAmount}
      onAmountChange={setSelectedAmount}
      arrivalTime={easyRouteConfig.arrivalTime}
      onArrivalTimeChange={handleEasyRouteArrivalTimeChange}
      hopCount={easyRouteConfig.hopCount}
      onHopCountChange={handleEasyRouteHopCountChange}
      destinationWallet={easyRouteConfig.destinationWallet}
      onDestinationWalletChange={handleEasyRouteDestinationChange}
      walletError={easyRouteWalletError}
      onWalletValidate={validateEasyRouteWallet}
      feePercentage={feePercentage}
    />
  )

  // ============ Hops Tab (Custom Route) ============
  const hopsTabBody = (
    <>
      <HopsSection
        hops={hops}
        name={routeName}
        setRouteName={setRouteName}
        openCustomIdx={openCustomIdx}
        csvErrors={csvErrors}
        csvShowAll={csvShowAll}
        hopRowErrors={formErrors.hopRowErrors}
        canAddRow={canAddRow}
        onWalletChange={setWallet}
        onWalletValidate={validateWallet}
        onDelayChange={setDelay}
        onCustomClick={idx =>
          setOpenCustomIdx(prev => (prev === idx ? null : idx))
        }
        onCustomDateChange={handleCustomDateChange}
        onCustomError={handleCustomDateError}
        onRemoveRow={removeRow}
        onAddRow={addRow}
        onUploadClick={handleUploadClick}
        onDownloadTemplate={handleDownloadTemplate}
        onCsvShowAll={setCsvShowAll}
      />
    </>
  )

  // ============ Summary Tab ============
  // Convert easy route config to hops format for summary display
  const easyRouteHops: HopConfigItem[] = useMemo(() => {
    if (routeMode !== 'easy') return []

    const { hopCount, arrivalTime, destinationWallet } = easyRouteConfig
    if (!arrivalTime || !destinationWallet) return []

    // Calculate delay between hops based on arrival time
    const now = new Date()
    const totalDelayMinutes = Math.max(
      0,
      Math.floor((arrivalTime.getTime() - now.getTime()) / (1000 * 60))
    )
    const delayPerHop = Math.floor(totalDelayMinutes / hopCount)

    // Create hops array - all intermediate hops go to random wallets, last hop goes to destination
    return Array.from({ length: hopCount }, (_, index) => ({
      wallet:
        index === hopCount - 1
          ? destinationWallet
          : `Hop ${index + 1} (Auto-generated)`,
      delayMinutes: delayPerHop,
    }))
  }, [routeMode, easyRouteConfig])

  const summaryTabBody = (
    <>
      {routeMode === 'easy' ? (
        <EasyRouteSummary
          selectedAsset={selectedAsset}
          selectedAmount={selectedAmount}
          easyRouteConfig={easyRouteConfig}
        />
      ) : (
        <>
          <div className='mb-6'>
            <h2 className='not-italic font-medium text-xl leading-6 text-[var(--white-100)] mb-2'>
              Final Destination & Summary
            </h2>
            <p className='not-italic font-light text-base leading-5 text-[var(--philippine-gray-500)]'>
              Review the hops, delays, and total route and enter your final
              destination wallet before confirming.
            </p>
          </div>
          <SummaryDisplay
            hops={hops}
            routeName={routeName}
            selectedAsset={selectedAsset}
            selectedAmount={selectedAmount}
          />
        </>
      )}
    </>
  )

  // ============ Total Time Calculation ============
  const totalMinutes = useMemo(() => {
    const hopsToCalculate = routeMode === 'easy' ? easyRouteHops : hops
    return calculateTotalMinutes(hopsToCalculate)
  }, [routeMode, easyRouteHops, hops])
  const etaDate = useMemo(
    () => new Date(Date.now() + totalMinutes * 60 * 1000),
    [totalMinutes]
  )

  // ============ Footer ============
  const handleNavigateBack = () => {
    if (activeKey === 'choose') {
      navigate({ to: '/my-assets' })
    } else if (activeKey === 'mode') {
      setActiveKey('choose')
    } else if (activeKey === 'configure') {
      setActiveKey('mode')
    } else if (activeKey === 'summary') {
      setActiveKey('configure')
    }
  }

  const handleNextStep = () => {
    if (activeKey === 'choose') {
      setActiveKey('mode')
    } else if (activeKey === 'mode') {
      setActiveKey('configure')
    } else if (activeKey === 'configure') {
      setActiveKey('summary')
    }
  }

  const handleConfirm = async () => {
    if (!selectedAsset) return

    // Validate all inputs
    const newErrors: { hopRowErrors: Record<number, string | null> } = {
      hopRowErrors: {},
    }

    hops.forEach((h, i) => {
      const w = (h.wallet || '').trim()
      if (w && !isValidSolanaAddress(w)) {
        newErrors.hopRowErrors[i] = 'Invalid Solana address'
      }
    })

    if ((selectedAmount || 0) <= 0) {
      newErrors.hopRowErrors = {
        ...newErrors.hopRowErrors,
        ...formErrors.hopRowErrors,
      }
    }

    const hasErrors = Object.keys(newErrors.hopRowErrors).length > 0

    if (hasErrors) {
      setFormErrors(newErrors)
      const firstHopErrIdx = Object.keys(newErrors.hopRowErrors)[0]
      if (firstHopErrIdx !== undefined) {
        document
          .getElementById(`hop-wallet-${firstHopErrIdx}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return
    }

    setFormErrors({ hopRowErrors: {} })

    if ((selectedAmount || 0) <= 0) return

    try {
      setIsSubmitting(true)

      const now = new Date()
      const rows = hops.filter(h => (h.wallet || '').trim().length > 0)
      if (rows.length === 0) return

      const recipients = rows.map(h => h.wallet.trim())

      const times: string[] = []
      const scheduledHops: Array<{
        recipient: string
        scheduledAt: string
        delayMinutes?: number
        isCustomTime?: boolean
      }> = []

      rows.forEach((row, i) => {
        const recipient = row.wallet.trim()

        if (row.scheduledAtUtc) {
          // Custom absolute time from date picker
          const time = new Date(row.scheduledAtUtc).toISOString()
          times.push(time)
          scheduledHops.push({
            recipient,
            scheduledAt: time,
            isCustomTime: true,
          })
        } else {
          // Delay-based time
          const delayMinutes =
            typeof row.delayMinutes === 'number' ? row.delayMinutes : 0
          let time: string

          if (i === 0) {
            time = new Date(
              now.getTime() + delayMinutes * 60 * 1000
            ).toISOString()
          } else {
            const prevTime = new Date(times[i - 1])
            time = new Date(
              prevTime.getTime() + delayMinutes * 60 * 1000
            ).toISOString()
          }

          times.push(time)
          scheduledHops.push({
            recipient,
            scheduledAt: time,
            delayMinutes, // Store delay metadata for recalculation
          })
        }
      })

      const decimals =
        typeof selectedAsset.decimals === 'number'
          ? selectedAsset.decimals
          : selectedAsset.tokenType === 'SOL'
          ? 9
          : 6

      // Deduct fee from the user's selected amount so that hopAmount + fee = selectedAmount
      const userAmount = selectedAmount || 0
      const actualHopAmount = feePercentage > 0
        ? Math.floor((userAmount / (1 + feePercentage)) * 1e6) / 1e6
        : userAmount

      const timestampRoute: TimestampRouteInput = {
        hopAmountTokens: String(actualHopAmount),
        splMint:
          selectedAsset.tokenType === 'SPL' ? selectedAsset.address : undefined,
        hops: scheduledHops,
      }

      const internalRouteInput = convertTimestampToRouteInput(
        timestampRoute,
        decimals
      )

      const routeData = {
        name: routeName,
        tokenType: selectedAsset.tokenType,
        tokenMint: internalRouteInput.splMint,
        tokenSymbol: selectedAsset.symbol,
        tokenDecimals: decimals,
        hopAmountTokens: timestampRoute.hopAmountTokens,
        hopAmountRaw: internalRouteInput.hopAmount,
        totalSpendTokens: String(userAmount),
        hops: timestampRoute.hops,
      }

      const route = await handleRouteSubmit(routeData, selectedAsset.tokenType)
      if (route) {
        setCreatedRoute(route)
        setShowDeployModal(true)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const canProceedFromHops =
    !hasBlockingWalletErrors(formErrors.hopRowErrors) &&
    canAddRow &&
    routeName.trim().length > 0
  const canProceedFromChoose = selectedAsset && (selectedAmount || 0) > 0
  const canProceedFromEasyRoute =
    easyRouteConfig.arrivalTime !== null &&
    easyRouteConfig.destinationWallet.trim().length > 0 &&
    isValidSolanaAddress(easyRouteConfig.destinationWallet) &&
    !easyRouteWalletError &&
    (selectedAmount || 0) > 0

  const showConfirmButton = activeKey === 'summary'

  const shouldHideHeaderButtons =
    activeKey === 'mode' || (activeKey === 'configure' && routeMode === 'easy')

  const getActiveTabButton = () => {
    if (activeKey === 'choose' || activeKey === 'mode') return 'choose'
    if (activeKey === 'configure') return 'configure'
    if (activeKey === 'summary') return 'summary'
    return 'choose' // default
  }

  const activeTabButton = getActiveTabButton()

  const isTabCompleted = (tabKey: string): boolean => {
    if (tabKey === 'choose') {
      return !!canProceedFromChoose
    }
    if (tabKey === 'configure') {
      return routeMode === 'easy' ? !!canProceedFromEasyRoute : !!canProceedFromHops
    }
    if (tabKey === 'summary') {
      // Summary is considered completed if we can reach it (all previous steps are done)
      return !!canProceedFromChoose && (routeMode === 'easy' ? !!canProceedFromEasyRoute : !!canProceedFromHops)
    }
    return false
  }

  const getButtonState = (tabKey: string): 'active' | 'completed' | 'inactive' => {
    if (tabKey === activeTabButton) {
      return 'active' // Active state has priority
    }
    if (isTabCompleted(tabKey)) {
      return 'completed'
    }
    return 'inactive'
  }

  const tabButtons = [
    {
      key: 'choose',
      icon: ChooseTokenIcon,
      iconContainerClass: 'h-[17px] w-4',
      alt: 'choose-token-icon',
    },
    {
      key: 'configure',
      icon: HopsAndDelaysIcon,
      iconContainerClass: 'h-[21px] w-4',
      alt: 'hops-and-delays-icon',
    },
    {
      key: 'summary',
      icon: FinalDestinationIcon,
      iconContainerClass: 'h-[18px] w-[18px]',
      alt: 'final-destination-icon',
    },
  ]

  const handleEasyRouteConfirm = async () => {
    if (!selectedAsset || !canProceedFromEasyRoute || !publicKey) return

    try {
      setIsSubmitting(true)

      // Calculate token decimals
      const decimals =
        typeof selectedAsset.decimals === 'number'
          ? selectedAsset.decimals
          : selectedAsset.tokenType === 'SOL'
          ? 9
          : 6

      // Deduct fee from the user's selected amount so that hopAmount + fee = selectedAmount
      const userAmount = selectedAmount || 0
      const actualHopAmount = feePercentage > 0
        ? Math.floor((userAmount / (1 + feePercentage)) * 1e6) / 1e6
        : userAmount

      // Calculate raw amount (amount * 10^decimals)
      const hopAmountRaw = String(Math.round(actualHopAmount * Math.pow(10, decimals)))

      // Prepare the Easy Route data for the backend
      const easyRouteData = {
        arrivalTime:
          easyRouteConfig.arrivalTime?.toISOString() ||
          new Date().toISOString(),
        hopCount: easyRouteConfig.hopCount,
        destinationWallet: easyRouteConfig.destinationWallet,
        tokenType: selectedAsset.tokenType as 'SOL' | 'SPL',
        tokenMint:
          selectedAsset.tokenType === 'SPL' ? selectedAsset.address : undefined,
        tokenSymbol: selectedAsset.symbol,
        tokenDecimals: decimals,
        hopAmountTokens: String(actualHopAmount),
        hopAmountRaw,
        totalSpendTokens: String(userAmount),
        creator: publicKey.toBase58(),
      }

      // Call the backend to create the Easy Route
      const result = await createEasyRoute.mutateAsync(easyRouteData)

      if (result.success && result.data) {
        toast.success('Easy route created successfully!')

        // Convert backend Route response to DeployModalRoute format
        const route = result.data
        const deployModalRoute: DeployModalRoute = {
          id: route.id,
          routeId: route.routeId,
          name: route.name || 'Easy Route',
          tokenType: route.tokenType as 'SOL' | 'SPL',
          tokenMint: route.tokenMint,
          tokenSymbol: route.tokenSymbol,
          hopAmountTokens: route.hopAmountTokens,
          hopAmountRaw: route.hopAmountRaw,
          totalSpendTokens: String(userAmount),
          hops: result.data.hops,
        }
        setCreatedRoute(deployModalRoute)
        setShowDeployModal(true)
      } else {
        throw new Error(result.message || 'Failed to create Easy Route')
      }
    } catch (error) {
      console.error('Easy Route creation failed:', error)
      toast.error(`Easy Route creation failed: ${extractErrorMessage(error)}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const footer = (
    <div
      className={`flex ${
        isMobile
          ? 'flex-col-reverse gap-4'
          : activeKey === 'mode'
          ? 'flex-row justify-center items-start'
          : 'flex-row justify-between items-start'
      }`}
    >
      {activeKey !== 'choose' && activeKey !== 'mode' ? (
        <div className={`flex flex-col gap-3 ${isMobile ? 'w-full' : ''}`}>
          <div className='not-italic font-medium text-base leading-4 text-[var(--white-100)]'>
            {routeMode === 'easy' && easyRouteConfig.arrivalTime
              ? 'Arrival Time'
              : 'Total Estimated Time'}
          </div>
          <div className='flex flex-row items-center gap-2 not-italic font-medium text-sm leading-4 text-[rgba(255,_255,_255,_0.46)]'>
            {routeMode === 'easy' && easyRouteConfig.arrivalTime ? (
              <>
                Arrives at{' '}
                <span className='text-[var(--laser-lemon-500)]'>
                  {easyRouteConfig.arrivalTime.toLocaleString([], {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </>
            ) : (
              <>
                {formatDuration(totalMinutes)} total — Arrives at{' '}
                <span className='text-[var(--laser-lemon-500)]'>
                  {etaDate.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </>
            )}
          </div>
        </div>
      ) : activeKey === 'mode' ? null : (
        <div />
      )}

      <div className={`flex items-center gap-3 ${isMobile ? 'w-full' : ''}`}>
        <button
          type='button'
          onClick={handleNavigateBack}
          className={`flex items-center justify-center gap-2 rounded-3xl bg-transparent text-[var(--white-100)] not-italic font-medium text-base leading-5 px-6 py-3 transition hover:bg-white/5 border border-[var(--white-100)] ${
            isMobile ? 'flex-1' : 'w-36'
          }`}
        >
          Back
        </button>

        {!showConfirmButton ? (
          <button
            type='button'
            onClick={handleNextStep}
            disabled={
              (activeKey === 'configure' &&
                routeMode === 'custom' &&
                !canProceedFromHops) ||
              (activeKey === 'configure' &&
                routeMode === 'easy' &&
                !canProceedFromEasyRoute) ||
              (activeKey === 'choose' && !canProceedFromChoose)
            }
            className={`flex items-center justify-center gap-2 rounded-3xl text-[var(--black-900)] not-italic font-medium text-base leading-5 px-6 py-3 disabled:opacity-15 shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition ${
              activeKey === 'configure' && routeMode === 'custom'
                ? canProceedFromHops
                  ? 'bg-[var(--laser-lemon-500)] hover:brightness-95'
                  : 'bg-[var(--laser-lemon-500-transparency-30)] cursor-not-allowed'
                : activeKey === 'configure' && routeMode === 'easy'
                ? canProceedFromEasyRoute
                  ? 'bg-[var(--laser-lemon-500)] hover:brightness-95'
                  : 'bg-[var(--laser-lemon-500-transparency-30)] cursor-not-allowed'
                : 'bg-[var(--laser-lemon-500)] hover:brightness-95'
            } ${isMobile ? 'flex-1' : 'w-36'}`}
          >
            Next Step
          </button>
        ) : (
          <button
            type='button'
            onClick={
              routeMode === 'easy' ? handleEasyRouteConfirm : handleConfirm
            }
            disabled={routeMode === 'easy' ? !canProceedFromEasyRoute : false}
            className={`flex items-center justify-center gap-2 rounded-3xl text-[var(--black-900)] not-italic font-medium text-base leading-5 px-6 py-3 shadow-[0_8px_24px_var(--black-900-transparency-45)] transition ${
              routeMode === 'easy' && !canProceedFromEasyRoute
                ? 'bg-[var(--laser-lemon-500-transparency-30)] cursor-not-allowed opacity-50'
                : 'bg-[var(--laser-lemon-500)] hover:brightness-95'
            } ${isMobile ? 'flex-1' : 'w-36'}`}
          >
            {isSubmitting ? 'Confirming…' : 'Confirm'}
          </button>
        )}
      </div>
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
        cardHeader={
          shouldHideHeaderButtons
            ? undefined
            : {
                tabs: [],
                activeKey: '',
                leftSlot: (
                  <div className='flex flex-row items-center gap-2'>
                    {tabButtons.map(tabButton => {
                      const buttonState = getButtonState(tabButton.key)
                      const isActive = buttonState === 'active'
                      const isCompleted = buttonState === 'completed'
                      
                      return (
                        <div key={tabButton.key} className='relative'>
                          {isActive && (
                            <img
                              src={ThreeLinesIndicator}
                              alt='active-indicator'
                              className='hidden sm:block absolute -top-[40px] left-1/2 -translate-x-1/2 w-[25px] h-[48px] pointer-events-none z-10'
                            />
                          )}
                          <div
                            className={`relative flex items-center justify-center gap-2 transition-all rounded-2xl h-[46px] w-[46px] ${
                              isActive
                                ? 'bg-[var(--white-100)]'
                                : isCompleted
                                ? 'bg-[var(--laser-lemon-500)]'
                                : 'bg-[var(--eerie-black-700)]'
                            }`}
                          >
                            <div
                              className={`${tabButton.iconContainerClass} flex items-center justify-center`}
                            >
                              <img
                                src={tabButton.icon}
                                alt={tabButton.alt}
                                className='h-full w-full object-contain transition-all'
                                style={{
                                  filter:
                                    isActive || isCompleted
                                      ? 'brightness(0)' // Black when active or completed
                                      : 'brightness(0) invert(1)', // White when inactive
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ),
                rightSlot: (
                  <div className='flex flex-wrap items-center gap-2 w-full sm:w-auto'>
                    {/* Navigation Tabs */}
                    {/* <div className='flex flex-row items-center gap-2'>
                      {TABS.map(tab => {
                        const isActive = tab.key === activeNavTab
                        return (
                          <button
                            key={tab.key}
                            type='button'
                            onClick={() => tab.onTabClick()}
                            className={`flex items-center justify-center gap-2 transition-all rounded-2xl h-[46px] w-[46px] ${
                              isActive
                                ? 'bg-[var(--white-100)]'
                                : 'bg-[var(--eerie-black-700)] hover:bg-[var(--white-100-transparency-07)]'
                            }`}
                          >
                            <div
                              className='h-4 w-4 flex items-center justify-center'
                            >
                              {typeof tab.icon === 'string' ? (
                                <img
                                  src={tab.icon}
                                  alt={`${tab.key}-icon`}
                                  className='h-full w-full object-contain'
                                />
                              ) : React.isValidElement(tab.icon) ? (
                                React.cloneElement(
                                  tab.icon as React.ReactElement<{ color?: string }>,
                                  {
                                    color: isActive
                                      ? 'var(--chinese-black-800)'
                                      : 'var(--white-100)',
                                  }
                                )
                              ) : (
                                (() => {
                                  const Icon = tab.icon as React.ElementType
                                  return <Icon />
                                })()
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div> */}
                    {/* CSV Buttons - only show when in custom route configure mode */}
                    {activeKey === 'configure' && routeMode === 'custom' && (
                      <div className='flex flex-row items-center gap-2'>
                        <button
                          type='button'
                          onClick={handleUploadClick}
                          className='bg-[var(--white-100-transparency-02)] flex items-center justify-center gap-2 rounded-2xl pl-4 pr-3 py-1 not-italic font-medium text-sm leading-4 text-nowrap text-center text-[var(--cultured-white-500)] h-10 flex-1 sm:flex-none'
                          style={{
                            boxShadow: 'inset 0px 0px 7.9px rgba(255,255,255,0.14)',
                          }}
                        >
                          Upload CSV
                        </button>
                        <input
                          ref={fileInputRef}
                          type='file'
                          accept='.csv'
                          onChange={handleFileChange}
                          style={{ display: 'none' }}
                        />
                        <button
                          type='button'
                          onClick={handleDownloadTemplate}
                          className='bg-[var(--white-100-transparency-02)] flex items-center justify-center gap-2 rounded-2xl pl-4 pr-3 py-1 not-italic font-medium text-sm leading-4 text-nowrap text-center text-[var(--cultured-white-500)] h-10 flex-1 sm:flex-none'
                          style={{
                            boxShadow: 'inset 0px 0px 7.9px rgba(255,255,255,0.14)',
                          }}
                        >
                          CSV Template
                          <div className='h-4 w-4 rounded-full flex items-center justify-center'>
                            <img
                              src={DownloadIcon}
                              alt='download-icon'
                              className='h-full w-full object-contain'
                            />
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                ),
                headerClasses: {
                  mainCardHeaderContainer: '!mb-12',
                  tabsContainer: '!gap-2',
                  button: {
                    base: 'transition-all rounded-2xl h-[46px] w-[46px]',
                    active: 'bg-[var(--white-100)]',
                    inactive:
                      'bg-[var(--eerie-black-700)] hover:bg-[var(--white-100-transparency-07)]',
                    final: (key: string, isActive: boolean) =>
                      (key === 'configure' && routeMode === 'custom' && canAddRow) ||
                      (key === 'choose' && !isActive && (selectedAmount || 0) > 0) ||
                      (key === 'mode' && !isActive && routeMode)
                        ? 'bg-[var(--laser-lemon-500)]'
                        : '',
                  },
                  iconColor: {
                    active: 'var(--chinese-black-800)',
                    inactive: 'var(--white-100)',
                    final: (key: string, isActive: boolean) =>
                      (key === 'configure' && routeMode === 'custom' && canAddRow) ||
                      (key === 'choose' && !isActive && (selectedAmount || 0) > 0) ||
                      (key === 'mode' && !isActive && routeMode)
                        ? 'var(--chinese-black-800)'
                        : '',
                  },
                  label: {
                    base: 'hidden',
                  },
                },
              }
        }
        cardBody={
          activeKey === 'choose'
            ? chooseTabBody
            : activeKey === 'mode'
            ? modeTabBody
            : activeKey === 'configure'
            ? routeMode === 'easy'
              ? easyRouteTabBody
              : hopsTabBody
            : summaryTabBody
        }
        cardFooter={footer}
        cardHeight='auto'
        cardMaxHeight='850px'
      />

      {/* Deploy Modal */}
      <DeployModal
        isOpen={showDeployModal}
        route={createdRoute}
        onClose={() => {
          setShowDeployModal(false)
          navigate({ to: '/history' })
        }}
        onDeploySuccess={() => {
          setShowDeployModal(false)
          navigate({ to: '/history' })
        }}
      />
    </div>
  )
}

// Helper function
function parseNumber(val: string | number | undefined): number {
  if (val === undefined) return 0
  if (typeof val === 'number') return val
  return Number(String(val).replace(/[$,]/g, '').trim()) || 0
}
