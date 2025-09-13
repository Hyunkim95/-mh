import { useQuery } from '@tanstack/react-query';
import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';

interface UseTokenInfoProps {
  mintAddress?: string;
  connection?: Connection;
  enabled?: boolean;
}

export interface TokenInfo {
  decimals: number;
  supply: bigint;
  mintAuthority: PublicKey | null;
  freezeAuthority: PublicKey | null;
}

export function useTokenInfo({ mintAddress, connection, enabled = true }: UseTokenInfoProps) {
  const query = useQuery({
    queryKey: ['tokenInfo', mintAddress],
    queryFn: async (): Promise<TokenInfo> => {
      if (!mintAddress || !connection) {
        throw new Error('Mint address and connection are required');
      }

      try {
        const mintPublicKey = new PublicKey(mintAddress);
        const mintInfo = await getMint(connection, mintPublicKey);
        
        return {
          decimals: mintInfo.decimals,
          supply: mintInfo.supply,
          mintAuthority: mintInfo.mintAuthority,
          freezeAuthority: mintInfo.freezeAuthority,
        };
      } catch (error) {
        console.error('Error fetching token info:', error);
        throw error;
      }
    },
    enabled: enabled && !!mintAddress && !!connection,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 2,
  });

  return {
    tokenInfo: query.data,
    decimals: query.data?.decimals ?? 6, // Default to 6 decimals
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
} 