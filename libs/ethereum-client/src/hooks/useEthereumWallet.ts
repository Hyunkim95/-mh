import { useCallback } from 'react';
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { shortenAddress, formatChainName } from '../utils/formatting';

export interface UseEthereumWalletConfig {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export interface UseEthereumWalletReturn {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  address: string | undefined;
  shortAddress: string;
  chainId: number | undefined;
  chainName: string;
  
  // Actions
  connect: () => void;
  disconnect: () => Promise<void>;
  
  // Modal controls
  openConnectModal: () => void;
}

export function useEthereumWallet(config: UseEthereumWalletConfig = {}): UseEthereumWalletReturn {
  const { onConnect, onDisconnect, onError } = config;

  const { address, isConnected } = useAccount({
    onConnect: () => {
      onConnect?.();
    },
    onDisconnect: () => {
      onDisconnect?.();
    },
  });

  const { isPending: isConnecting } = useConnect({
    mutation: {
      onError: (error: Error) => {
        onError?.(new Error(error.message));
      },
    },
  });

  const { disconnectAsync } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const chainId = useChainId();

  const connect = useCallback(() => {
    openConnectModal?.();
  }, [openConnectModal]);

  const disconnect = useCallback(async () => {
    try {
      await disconnectAsync();
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Failed to disconnect'));
    }
  }, [disconnectAsync, onError]);

  return {
    // Connection state
    isConnected,
    isConnecting,
    address,
    shortAddress: address ? shortenAddress(address) : '',
    chainId,
    chainName: chainId ? formatChainName(chainId) : '',
    
    // Actions
    connect,
    disconnect,
    
    // Modal controls
    openConnectModal: connect,
  };
}