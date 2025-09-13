import { useQuery, useMutation } from '@tanstack/react-query';
import { BN } from '@coral-xyz/anchor';

interface ExecutorInfo {
  routeId: number;
  publicKey: string;
}

interface ExecutorBalance {
  routeId: number;
  balance: string;
  balanceSOL: string;
}

interface WithdrawResponse {
  signature: string;
  routeId: number;
  to: string;
  amount: string;
}

interface TrpcClient {
  contract: {
    getExecutorInfo: {
      query: (input: { routeId: number }) => Promise<{ data: ExecutorInfo }>;
    };
    getExecutorBalance: {
      query: (input: { routeId: number }) => Promise<{ data: ExecutorBalance }>;
    };
    withdrawOnBehalf: {
      mutate: (input: { routeId: number; to: string; amount: string }) => Promise<{ data: WithdrawResponse }>;
    };
  };
}

interface UseExecutorProps {
  routeId: number;
  trpcClient: TrpcClient;
  enabled?: boolean;
}

/**
 * Hook for managing executor wallet operations for a given route
 * Provides public key, balance, and withdrawal functionality
 * 
 * @param routeId - The route ID to manage executor for
 * @param trpcClient - The tRPC client instance
 * @param enabled - Whether the queries should be enabled
 * @returns Object containing executor data and operations
 */
export function useExecutor({ routeId, trpcClient, enabled = true }: UseExecutorProps) {
  // Query for executor public key
  const executorInfoQuery = useQuery({
    queryKey: ['executorInfo', routeId],
    queryFn: async () => {
      const response = await trpcClient.contract.getExecutorInfo.query({ routeId });
      return response.data;
    },
    enabled: enabled && !!routeId,
    staleTime: 5 * 60 * 1000, // 5 minutes - public key doesn't change
    refetchOnWindowFocus: false,
  });

  // Query for executor balance
  const balanceQuery = useQuery({
    queryKey: ['executorBalance', routeId],
    queryFn: async () => {
      const response = await trpcClient.contract.getExecutorBalance.query({ routeId });
      return response.data;
    },
    enabled: enabled && !!routeId,
    staleTime: 30 * 1000, // 30 seconds - balance can change frequently
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  });

  // Mutation for withdrawing funds
  const withdrawMutation = useMutation({
    mutationFn: async ({ to, amount }: { to: string; amount: string }) => {
      const response = await trpcClient.contract.withdrawOnBehalf.mutate({
        routeId,
        to,
        amount,
      });
      return response.data;
    },
    onSuccess: () => {
      // Refetch balance after successful withdrawal
      balanceQuery.refetch();
    },
  });

  // Withdrawal function that accepts amount as BN or string/number
  const withdraw = async (to: string, amount: BN | string | number) => {
    const amountStr = typeof amount === 'string' || typeof amount === 'number' 
      ? amount.toString()
      : amount.toString();

    return withdrawMutation.mutateAsync({ to, amount: amountStr });
  };

  return {
    // Executor public key
    publicKey: executorInfoQuery.data?.publicKey ?? null,
    
    // Balance information
    balance: balanceQuery.data?.balance ? new BN(balanceQuery.data.balance) : null,
    balanceSOL: balanceQuery.data?.balanceSOL ? parseFloat(balanceQuery.data.balanceSOL) : null,
    
    // Withdrawal function
    withdraw,
    
    // Loading states
    isLoadingPublicKey: executorInfoQuery.isLoading,
    isLoadingBalance: balanceQuery.isLoading,
    isWithdrawing: withdrawMutation.isPending,
    
    // Error states
    publicKeyError: executorInfoQuery.error,
    balanceError: balanceQuery.error,
    withdrawError: withdrawMutation.error,
    
    // Refetch functions
    refetchPublicKey: executorInfoQuery.refetch,
    refetchBalance: balanceQuery.refetch,
    
    // General loading state
    isLoading: executorInfoQuery.isLoading || balanceQuery.isLoading,
    
    // General error state
    error: executorInfoQuery.error || balanceQuery.error || withdrawMutation.error,
  };
}