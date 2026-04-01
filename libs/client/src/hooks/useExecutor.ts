import { BN } from "bn.js";
import { trpc } from "../trpc";

/**
 * Hook for managing executor wallet operations for a given route
 * Provides public key, balance, and withdrawal functionality
 *
 * @param routeId - The route ID to manage executor for
 * @returns Object containing executor data and operations
 */
export function useExecutor(routeId: number) {
  // Query for executor public key
  const executorInfoQuery = trpc.contract.getExecutorInfo.useQuery(
    { routeId },
    {
      enabled: !!routeId,
      staleTime: 5 * 60 * 1000, // 5 minutes - public key doesn't change
      refetchOnWindowFocus: false,
    }
  );

  // Query for executor balance
  const balanceQuery = trpc.contract.getExecutorBalance.useQuery(
    { routeId },
    {
      enabled: !!routeId,
      staleTime: 30 * 1000, // 30 seconds - balance can change frequently
      refetchInterval: 30 * 1000, // Refetch every 30 seconds
    }
  );

  // Mutation for withdrawing funds
  const withdrawMutation = trpc.contract.withdrawOnBehalf.useMutation({
    onSuccess: () => {
      // Refetch balance after successful withdrawal
      balanceQuery.refetch();
    },
  });

  // Withdrawal function that accepts amount as BN or string/number
  const withdraw = async (to: string, amount: typeof BN | string | number) => {
    const amountStr =
      typeof amount === "string" || typeof amount === "number"
        ? amount.toString()
        : amount.toString();

    return withdrawMutation.mutateAsync({
      routeId,
      to,
      amount: amountStr,
    });
  };
  return {
    // Executor public key
    publicKey: executorInfoQuery.data?.data?.publicKey ?? null,

    // Balance information
    balance: balanceQuery.data?.data?.balance
      ? new BN(balanceQuery.data.data.balance)
      : null,
    balanceSOL: balanceQuery.data?.data?.balanceSOL
      ? parseFloat(balanceQuery.data.data.balanceSOL)
      : null,

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
    error:
      executorInfoQuery.error || balanceQuery.error || withdrawMutation.error,
  };
}
