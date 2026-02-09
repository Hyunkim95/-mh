import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { useState, useCallback } from 'react'
import type { TokenAsset } from '../store/atoms'

interface UseFreshTokenBalanceResult {
  freshBalance: number | null
  isLoading: boolean
  error: string | null
  refetchBalance: () => Promise<number | null>
}

/**
 * Fetches the actual on-chain token balance directly from Solana RPC,
 * bypassing the server-side Helius cache entirely.
 */
export const useFreshTokenBalance = (
  asset: TokenAsset | null
): UseFreshTokenBalanceResult => {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const [freshBalance, setFreshBalance] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetchBalance = useCallback(async (): Promise<number | null> => {
    if (!asset || !publicKey || !connection) {
      return null
    }

    setIsLoading(true)
    setError(null)

    try {
      let balance: number

      if (asset.tokenType === 'SOL') {
        const lamports = await connection.getBalance(publicKey)
        balance = lamports / LAMPORTS_PER_SOL
      } else {
        const mintPubkey = new PublicKey(asset.address)
        const ata = getAssociatedTokenAddressSync(mintPubkey, publicKey, false)
        const decimals =
          typeof asset.decimals === 'number' ? asset.decimals : 6

        try {
          const accountInfo = await getAccount(connection, ata)
          // Use BigInt division before Number conversion to preserve precision
          balance = Number(accountInfo.amount / BigInt(10 ** decimals))
        } catch {
          // Token account doesn't exist = balance is 0
          balance = 0
        }
      }

      setFreshBalance(balance)
      return balance
    } catch (err) {
      console.error('[useFreshTokenBalance] Failed to fetch on-chain balance:', err)
      setError('Failed to fetch fresh balance')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [asset?.address, asset?.tokenType, asset?.decimals, publicKey, connection])

  return { freshBalance, isLoading, error, refetchBalance }
}
