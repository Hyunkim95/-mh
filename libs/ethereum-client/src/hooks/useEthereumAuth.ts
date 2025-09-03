import { useCallback, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { createSiweMessage } from 'viem/siwe';
import { defaultEthereumAuthAPI, EthereumAuthAPI } from '../utils/authApi';
import { EvmConnectRequest } from '../types/auth';

export interface UseEthereumAuthConfig {
  authAPI?: EthereumAuthAPI;
  statement?: string;
  domain?: string;
  uri?: string;
  version?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  referralCode?: string;
}

export interface UseEthereumAuthReturn {
  authenticate: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
  isConnected: boolean;
  address: string | undefined;
}

export function useEthereumAuth(config: UseEthereumAuthConfig = {}): UseEthereumAuthReturn {
  const {
    authAPI = defaultEthereumAuthAPI,
    statement = 'Sign in with Ethereum to the app.',
    domain,
    uri,
    version = '1',
    onSuccess,
    onError,
    referralCode,
  } = config;

  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getMessageDetails = useCallback(() => {
    const { host, origin } = window.location;
    return {
      domain: domain || host,
      uri: uri || origin,
      version,
    };
  }, [domain, uri, version]);

  const authenticate = useCallback(async () => {
    if (!address || !isConnected) {
      const error = new Error('Please connect your wallet first');
      setError(error);
      onError?.(error);
      return;
    }

    if (!chainId) {
      const error = new Error('Unable to determine chain ID');
      setError(error);
      onError?.(error);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get nonce from backend
      const { nonce } = await authAPI.initiateEvmConnect();

      // Create SIWE message
      const messageDetails = getMessageDetails();
      const message = createSiweMessage({
        domain: messageDetails.domain,
        address,
        statement,
        uri: messageDetails.uri,
        version: messageDetails.version,
        chainId: chainId!,
        nonce,
      });

      // Sign the message
      const signature = await signMessageAsync({
        message,
      });

      // Send to backend for verification
      const request: EvmConnectRequest = {
        message,
        signature,
        referralCode,
      };

      await authAPI.evmConnect(request);
      
      onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Authentication failed');
      setError(error);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [
    address,
    isConnected,
    chainId,
    authAPI,
    getMessageDetails,
    statement,
    signMessageAsync,
    referralCode,
    onSuccess,
    onError,
  ]);

  return {
    authenticate,
    isLoading,
    error,
    isConnected,
    address,
  };
}