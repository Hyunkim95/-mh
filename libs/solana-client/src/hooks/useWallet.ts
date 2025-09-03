import { useWallet as useWalletAdapter } from '@solana/wallet-adapter-react';

/**
 * Custom hook that wraps the wallet adapter with additional utilities
 */
export function useWallet() {
  const wallet = useWalletAdapter();

  const isConnected = wallet.connected && wallet.publicKey !== null;

  return {
    ...wallet,
    isConnected,
    address: wallet.publicKey?.toBase58() || null,
  };
}
