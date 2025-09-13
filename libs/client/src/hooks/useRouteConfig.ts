import { useQuery } from '@tanstack/react-query';
import { 
  GetRouteConfigInput,
  RouteConfigResponse,
  RouteStateResponse
} from '../types/route';

interface TrpcClient {
  contract: {
    getRouteConfig: {
      query: (input: GetRouteConfigInput) => Promise<{ data: RouteConfigResponse | null }>;
    };
    getRouteState: {
      query: (input: GetRouteConfigInput) => Promise<{ data: RouteStateResponse | null }>;
    };
  };
}

interface UseRouteConfigProps {
  routeId: number;
  creator: string;
  tokenConfig: string;
  trpcClient: TrpcClient;
  enabled?: boolean;
}

export function useRouteConfig({ 
  routeId, 
  creator, 
  tokenConfig, 
  trpcClient, 
  enabled = true 
}: UseRouteConfigProps) {
  const routeConfigQuery = useQuery({
    queryKey: ['routeConfig', routeId, creator, tokenConfig],
    queryFn: async () => {
      const response = await trpcClient.contract.getRouteConfig.query({
        routeId,
        creator,
        tokenConfig,
      });
      return response.data;
    },
    enabled: enabled && !!creator && !!tokenConfig && routeId !== undefined,
  });

  const routeStateQuery = useQuery({
    queryKey: ['routeState', routeId, creator, tokenConfig],
    queryFn: async () => {
      const response = await trpcClient.contract.getRouteState.query({
        routeId,
        creator,
        tokenConfig,
      });
      return response.data;
    },
    enabled: enabled && !!creator && !!tokenConfig && routeId !== undefined,
  });

  return {
    routeConfig: routeConfigQuery.data,
    routeState: routeStateQuery.data,
    isLoading: routeConfigQuery.isLoading || routeStateQuery.isLoading,
    error: routeConfigQuery.error || routeStateQuery.error,
    refetch: () => {
      routeConfigQuery.refetch();
      routeStateQuery.refetch();
    },
  };
}

// Standalone function as specified in the requirements
export function getRouteConfig(trpcClient: TrpcClient) {
  return {
    routeConfig: (routeId: number, creator: string, tokenConfig: string) => {
      return useQuery({
        queryKey: ['routeConfig', routeId, creator, tokenConfig],
        queryFn: async () => {
          const response = await trpcClient.contract.getRouteConfig.query({
            routeId,
            creator,
            tokenConfig,
          });
          return response.data;
        },
      });
    },
    routeState: (routeId: number, creator: string, tokenConfig: string) => {
      return useQuery({
        queryKey: ['routeState', routeId, creator, tokenConfig],
        queryFn: async () => {
          const response = await trpcClient.contract.getRouteState.query({
            routeId,
            creator,
            tokenConfig,
          });
          return response.data;
        },
      });
    },
  };
}