import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletName } from '@solana/wallet-adapter-base';

export interface UseWalletConnectionReturn {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  publicKey: string | null;
  walletName: string | null;
  
  // Actions
  connect: (walletName?: WalletName) => Promise<void>;
  disconnect: () => Promise<void>;
  
  // Error handling
  error: string | null;
  clearError: () => void;
}

export function useWalletConnection(): UseWalletConnectionReturn {
  const {
    publicKey,
    connected,
    connecting,
    wallet,
    select,
    connect: walletConnect,
    disconnect: walletDisconnect,
  } = useWallet();

  const [error, setError] = useState<string | null>(null);
  const [isManuallyConnecting, setIsManuallyConnecting] = useState(false);

  // Clear error when connection state changes
  useEffect(() => {
    if (connected) {
      setError(null);
      setIsManuallyConnecting(false);
    }
  }, [connected]);

  // Clear error when wallet changes
  useEffect(() => {
    setError(null);
  }, [wallet]);

  const connect = useCallback(async (walletName?: WalletName) => {
    try {
      setError(null);
      setIsManuallyConnecting(true);

      // Select wallet if provided
      if (walletName && (!wallet || wallet.adapter.name !== walletName)) {
        select(walletName);
        // Wait a bit for wallet selection to take effect
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Check if wallet is available
      if (!wallet) {
        throw new Error('No wallet selected');
      }

      if (!wallet.readyState || wallet.readyState === 'NotDetected') {
        throw new Error(`${wallet.adapter.name} wallet is not installed`);
      }

      if (wallet.readyState === 'Loadable') {
        throw new Error(`${wallet.adapter.name} wallet is loading`);
      }

      if (wallet.readyState === 'Unsupported') {
        throw new Error(`${wallet.adapter.name} wallet is not supported on this device`);
      }

      // Connect to the wallet
      await walletConnect();
      
      if (!connected && !publicKey) {
        throw new Error('Failed to connect to wallet');
      }

    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to connect wallet';
      setError(errorMessage);
      console.error('Wallet connection error:', err);
      throw err;
    } finally {
      setIsManuallyConnecting(false);
    }
  }, [wallet, select, walletConnect, connected, publicKey]);

  const disconnect = useCallback(async () => {
    try {
      setError(null);
      await walletDisconnect();
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to disconnect wallet';
      setError(errorMessage);
      console.error('Wallet disconnect error:', err);
    }
  }, [walletDisconnect]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isConnected: connected,
    isConnecting: connecting || isManuallyConnecting,
    publicKey: publicKey?.toString() || null,
    walletName: wallet?.adapter.name || null,
    connect,
    disconnect,
    error,
    clearError,
  };
}