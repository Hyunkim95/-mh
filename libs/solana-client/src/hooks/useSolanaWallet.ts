import { useCallback, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { Wallet } from '@solana/wallet-adapter-react';
import { WalletName, WalletReadyState } from '@solana/wallet-adapter-base';

export interface UseSolanaWalletConfig {
  requireSigning?: boolean;
  onWalletConnected?: (wallet: Wallet) => void;
  onWalletDisconnected?: () => void;
  onError?: (error: Error) => void;
}

export interface UseSolanaWalletReturn {
  // Wallet state
  isConnected: boolean;
  isConnecting: boolean;
  publicKey: string | null;
  currentWallet: Wallet | null;
  
  // Available wallets
  availableWallets: Wallet[];
  
  // Actions
  connect: (wallet?: Wallet) => Promise<void>;
  disconnect: () => Promise<void>;
  selectWallet: (walletName: string) => void;
}

export function useSolanaWallet(config: UseSolanaWalletConfig = {}): UseSolanaWalletReturn {
  const {
    onWalletConnected,
    onWalletDisconnected,
    onError
  } = config;

  const {
    connect: connectWallet,
    disconnect: disconnectWallet,
    wallet: currentWallet,
    wallets,
    select: selectWalletAdapter,
    connecting,
    publicKey,
    connected
  } = useWallet();

  const [isProcessing, setIsProcessing] = useState(false);

  // Filter to only show installed wallets
  const availableWallets = wallets.filter(
    wallet => wallet.readyState === WalletReadyState.Installed
  );

  const selectWallet = useCallback((walletName: string) => {
    selectWalletAdapter(walletName as WalletName);
  }, [selectWalletAdapter]);

  const connect = useCallback(async (wallet?: Wallet) => {
    try {
      setIsProcessing(true);
      
      if (wallet && currentWallet?.adapter.name !== wallet.adapter.name) {
        selectWalletAdapter(wallet.adapter.name);
        return; // Let the wallet adapter handle the connection
      }
      
      await connectWallet();
      
      if (currentWallet) {
        onWalletConnected?.(currentWallet);
      }
    } catch (error) {
      selectWalletAdapter(null);
      const err = error instanceof Error ? error : new Error('Failed to connect wallet');
      onError?.(err);
    } finally {
      setIsProcessing(false);
    }
  }, [
    currentWallet,
    connectWallet,
    selectWalletAdapter,
    onWalletConnected,
    onError
  ]);

  const disconnect = useCallback(async () => {
    try {
      setIsProcessing(true);
      await disconnectWallet();
      onWalletDisconnected?.();
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to disconnect wallet');
      onError?.(err);
    } finally {
      setIsProcessing(false);
    }
  }, [disconnectWallet, onWalletDisconnected, onError]);

  return {
    // Wallet state
    isConnected: connected,
    isConnecting: connecting || isProcessing,
    publicKey: publicKey?.toString() || null,
    currentWallet,
    
    // Available wallets
    availableWallets,
    
    // Actions
    connect,
    disconnect,
    selectWallet,
  };
}