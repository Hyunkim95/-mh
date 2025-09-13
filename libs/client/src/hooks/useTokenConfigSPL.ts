import { useQuery } from '@tanstack/react-query';
import { TokenConfigResponse } from '../types/tokenConfig';

interface TrpcClient {
  contract: {
    getTokenConfigSPL: {
      query: (input: { splMint: string; creator: string }) => Promise<{ data: TokenConfigResponse }>;
    };
  };
}

interface UseTokenConfigSPLProps {
  spl: string;
  creator: string;
  trpcClient: TrpcClient;
  enabled?: boolean;
}

export function useTokenConfigSPL({ spl, creator, trpcClient, enabled = true }: UseTokenConfigSPLProps) {
  const query = useQuery({
    queryKey: ['tokenConfigSPL', spl, creator],
    queryFn: async () => {
      const response = await trpcClient.contract.getTokenConfigSPL.query({
        splMint: spl,
        creator,
      });
      return response.data;
    },
    enabled: enabled && !!spl && !!creator,
  });

  return {
    tokenConfig: query.data?.tokenConfig,
    initialized: query.data?.initialized ?? false,
    tokenConfigPda: query.data?.tokenConfigPda,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}