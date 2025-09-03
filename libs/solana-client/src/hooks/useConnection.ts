import { useConnection as useConnectionAdapter } from '@solana/wallet-adapter-react';
import { Connection } from '@solana/web3.js';

/**
 * Hook to get the current Solana connection
 */
export function useConnection(): { connection: Connection } {
  const { connection } = useConnectionAdapter();
  
  return { connection };
}
