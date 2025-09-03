import { createAuthenticationAdapter } from '@rainbow-me/rainbowkit';
import { useMemo } from 'react';
import { createSiweMessage } from 'viem/siwe';
import { defaultEthereumAuthAPI, EthereumAuthAPI } from '../utils/authApi';

export interface UseAuthenticationAdapterConfig {
  statement?: string;
  domain?: string;
  uri?: string;
  version?: string;
  authAPI?: EthereumAuthAPI;
  referralCode?: string;
}

export interface UseAuthenticationAdapterReturn {
  adapter: ReturnType<typeof createAuthenticationAdapter>;
}

export function useAuthenticationAdapter(
  config: UseAuthenticationAdapterConfig = {}
): UseAuthenticationAdapterReturn {
  const {
    statement = 'Sign in with Ethereum to the app.',
    domain,
    uri,
    version = '1',
    authAPI = defaultEthereumAuthAPI,
    referralCode,
  } = config;

  const adapter = useMemo(
    () =>
      createAuthenticationAdapter({
        getNonce: async () => {
          const response = await authAPI.initiateEvmConnect();
          return response.nonce;
        },
        
        createMessage: ({ nonce, address, chainId }: { nonce: string; address: string; chainId: number }) => {
          const { host, origin } = window.location;
          
          return createSiweMessage({
            domain: domain || host,
            address,
            statement,
            uri: uri || origin,
            version: version as '1',
            chainId,
            nonce,
          });
        },
        
        verify: async ({ message, signature }: { message: string; signature: string }) => {
          try {
            await authAPI.evmConnect({
              message,
              signature,
              referralCode,
            });
            return true;
          } catch (error) {
            console.error('Authentication verification failed:', error);
            return false;
          }
        },
        
        signOut: async () => {
          // Implement sign out logic if needed
          return true;
        },
      }),
    [statement, domain, uri, version, authAPI, referralCode]
  );

  return { adapter };
}