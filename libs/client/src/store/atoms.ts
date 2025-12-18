import { atom } from 'jotai'

export type TokenAsset = {
  id: string // token mint for SPL or 'SOL'
  tokenType: 'SPL' | 'SOL'
  decimals: number
  icon: string
  symbol: string
  name: string
  amount: string | number
  usdValue?: string | number
  address: string // mint address (SPL) or placeholder for SOL
}

export type HopConfigItem = {
  wallet: string
  delayMinutes: number | null
  scheduledAtUtc?: string | null
}

export const selectedAssetAtom = atom<TokenAsset | null>(null)

export const hopsConfigAtom = atom<HopConfigItem[]>([
  { wallet: '', delayMinutes: null },
])

export const selectedAmountAtom = atom<number>(0)

// Route mode: 'easy' for simplified flow, 'custom' for manual hop configuration
export type RouteMode = 'easy' | 'custom'
export const routeModeAtom = atom<RouteMode>('easy')

// Easy route configuration
export interface EasyRouteConfig {
  arrivalTime: Date | null
  hopCount: number
  destinationWallet: string
}

export const easyRouteConfigAtom = atom<EasyRouteConfig>({
  arrivalTime: null,
  hopCount: 3,
  destinationWallet: '',
})
