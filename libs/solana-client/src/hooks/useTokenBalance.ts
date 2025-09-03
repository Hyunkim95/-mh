import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { useConnection } from './useConnection';

/**
 * Hook to get token balance for a specific mint and owner
 */
export function useTokenBalance(mint: PublicKey | null, owner: PublicKey | null) {
  const { connection } = useConnection();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!mint || !owner) {
      setBalance(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchBalance = async () => {
      try {
        const associatedTokenAccount = await getAssociatedTokenAddress(mint, owner);
        const account = await getAccount(connection, associatedTokenAccount);
        
        if (!cancelled) {
          setBalance(account.amount);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          // Token account might not exist, set balance to 0
          if (err instanceof Error && err.message.includes('could not find account')) {
            setBalance(BigInt(0));
          } else {
            setError(err as Error);
          }
          setLoading(false);
        }
      }
    };

    fetchBalance();

    return () => {
      cancelled = true;
    };
  }, [connection, mint, owner]);

  return { balance, loading, error };
}
