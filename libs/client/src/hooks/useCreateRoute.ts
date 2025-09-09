import { useMutation } from '@tanstack/react-query';
import { 
  InitializeRouteInput,
  InitializeRouteSOLInput,
  InitializeRouteResponse
} from '../types/route';

interface TrpcClient {
  contract: {
    initializeRoute: {
      mutate: (input: InitializeRouteInput) => Promise<{ data: InitializeRouteResponse }>;
    };
    initializeRouteSOL: {
      mutate: (input: InitializeRouteSOLInput) => Promise<{ data: InitializeRouteResponse }>;
    };
  };
}

interface UseCreateRouteProps {
  trpcClient: TrpcClient;
}

export function useCreateRoute({ trpcClient }: UseCreateRouteProps) {
  const initializeRouteMutation = useMutation({
    mutationFn: async (input: InitializeRouteInput) => {
      const response = await trpcClient.contract.initializeRoute.mutate(input);
      return response.data;
    },
  });

  const initializeRouteSOLMutation = useMutation({
    mutationFn: async (input: InitializeRouteSOLInput) => {
      const response = await trpcClient.contract.initializeRouteSOL.mutate(input);
      return response.data;
    },
  });

  return {
    initializeRoute: async (input: InitializeRouteInput): Promise<string> => {
      const result = await initializeRouteMutation.mutateAsync(input);
      return result.transaction;
    },
    initializeRouteSOL: async (input: InitializeRouteSOLInput): Promise<string> => {
      const result = await initializeRouteSOLMutation.mutateAsync(input);
      return result.transaction;
    },
    isLoading: initializeRouteMutation.isPending || initializeRouteSOLMutation.isPending,
    error: initializeRouteMutation.error || initializeRouteSOLMutation.error,
  };
}