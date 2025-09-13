import { useQuery } from '@tanstack/react-query';
import { TokenConfigResponse } from '../types/tokenConfig';

interface TrpcClient {
  contract: {
    getTokenConfigSOL: {
      query: (input: { creator: string }) => Promise<{ data: TokenConfigResponse }>;
    };
  };
}

interface UseTokenConfigSOLProps {
  creator: string;
  trpcClient: TrpcClient;
  enabled?: boolean;
}

export function useTokenConfigSOL({ creator, trpcClient, enabled = true }: UseTokenConfigSOLProps) {
  const query = useQuery({
    queryKey: ['tokenConfigSOL', creator],
    queryFn: async () => {
      const response = await trpcClient.contract.getTokenConfigSOL.query({
        creator,
      });
      return response.data;
    },
    enabled: enabled && !!creator,
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