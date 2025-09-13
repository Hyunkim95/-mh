import { useMutation } from '@tanstack/react-query';
import { 
  TokenConfigInput, 
  InitializeTokenConfigResponse 
} from '../types/tokenConfig';

interface TrpcClient {
  contract: {
    initializeTokenConfig: {
      mutate: (input: { splMint: string; tokenConfig: TokenConfigInput }) => Promise<{ data: InitializeTokenConfigResponse }>;
    };
    initializeTokenConfigSOL: {
      mutate: (input: { creator: string; tokenConfig: TokenConfigInput }) => Promise<{ data: InitializeTokenConfigResponse }>;
    };
  };
}

interface UseInitializeTokenConfigProps {
  trpcClient: TrpcClient;
}

export function useInitializeTokenConfig({ trpcClient }: UseInitializeTokenConfigProps) {
  const initializeTokenConfigMutation = useMutation({
    mutationFn: async ({ splMint, tokenConfig }: { splMint: string; tokenConfig: TokenConfigInput }) => {
      const response = await trpcClient.contract.initializeTokenConfig.mutate({
        splMint,
        tokenConfig,
      });
      return response.data;
    },
  });

  const initializeTokenConfigSOLMutation = useMutation({
    mutationFn: async ({ creator, tokenConfig }: { creator: string; tokenConfig: TokenConfigInput }) => {
      const response = await trpcClient.contract.initializeTokenConfigSOL.mutate({
        creator,
        tokenConfig,
      });
      return response.data;
    },
  });

  return {
    initializeTokenConfig: async (splAddress: string, tokenConfig: TokenConfigInput): Promise<string> => {
      const result = await initializeTokenConfigMutation.mutateAsync({
        splMint: splAddress,
        tokenConfig,
      });
      return result.transaction;
    },
    initializeTokenConfigSOL: async (creator: string, tokenConfig: TokenConfigInput): Promise<string> => {
      const result = await initializeTokenConfigSOLMutation.mutateAsync({
        creator,
        tokenConfig,
      });
      return result.transaction;
    },
    isLoading: initializeTokenConfigMutation.isPending || initializeTokenConfigSOLMutation.isPending,
    error: initializeTokenConfigMutation.error || initializeTokenConfigSOLMutation.error,
  };
}