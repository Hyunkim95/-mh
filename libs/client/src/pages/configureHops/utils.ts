import { PublicKey } from '@solana/web3.js'
import type { HopConfigItem } from '../../store/atoms'

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const parts: string[] = []
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  return parts.join(' ') || '0m'
}

export function parseNumber(val: string | number | undefined): number {
  if (val === undefined) return 0
  if (typeof val === 'number') return val
  return Number(String(val).replace(/[$,]/g, '').trim()) || 0
}

export function formatTokenAmount(n: number): string {
  if (!isFinite(n)) return '0'
  const fixed = n.toFixed(6)
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

export function isValidSolanaAddress(addr: string): boolean {
  try {
    const trimmed = (addr || '').trim()
    if (!trimmed) return false
    new PublicKey(trimmed)
    return true
  } catch {
    return false
  }
}

export function maskAddress(addr: string): string {
  return addr?.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-3)}` : addr
}

export function getRowBaseTime(hops: HopConfigItem[], idx: number): Date {
  const now = new Date()
  const rowsUpTo = hops.slice(0, idx)
  if (idx === 0 || rowsUpTo.length === 0) return now
  let current = now
  rowsUpTo.forEach(row => {
    if (row.scheduledAtUtc) {
      const t = new Date(row.scheduledAtUtc)
      if (!isNaN(t.getTime())) current = t
    } else {
      const add = typeof row.delayMinutes === 'number' ? row.delayMinutes : 0
      current = new Date(current.getTime() + add * 60 * 1000)
    }
  })
  return current
}

export function calculateTotalMinutes(hops: HopConfigItem[]): number {
  const now = new Date()
  const rows = hops.filter(h => (h.wallet || '').trim().length > 0)
  if (rows.length === 0) return 0
  const times: Date[] = []
  rows.forEach((row, i) => {
    if (row.scheduledAtUtc) {
      times.push(new Date(row.scheduledAtUtc))
    } else {
      const add = typeof row.delayMinutes === 'number' ? row.delayMinutes : 0
      if (i === 0) {
        times.push(new Date(now.getTime() + add * 60 * 1000))
      } else {
        const prev = times[i - 1]
        times.push(new Date(prev.getTime() + add * 60 * 1000))
      }
    }
  })
  const last = times[times.length - 1]
  const diffMin = Math.max(
    0,
    Math.round((last.getTime() - now.getTime()) / (60 * 1000))
  )
  return diffMin
}

export function getLastHopWallet(hops: HopConfigItem[]): string {
  const wallets = hops.map(h => (h.wallet || '').trim()).filter(Boolean)
  return wallets.length ? wallets[wallets.length - 1] : ''
}

export function hasBlockingWalletErrors(hopRowErrors: Record<number, string | null>): boolean {
  const errors = Object.values(hopRowErrors)
  return errors.some(msg => {
    if (!msg) return false
    const lower = msg.toLowerCase()
    return lower.includes('invalid solana address') || lower.includes('checking')
  })
}
