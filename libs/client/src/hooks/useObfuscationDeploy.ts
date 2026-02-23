import { Buffer } from "buffer";
import { toast } from "react-hot-toast";
import { Transaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { trpc } from "../trpc";
import { extractErrorMessage } from "../utils/extractErrorMessage";

/**
 * Hook for handling obfuscation funding transactions
 *
 * This hook manages the flow of:
 * 1. Getting funding transactions for intermediate wallets
 * 2. Batch signing all transactions (single wallet popup)
 * 3. Sending each transaction individually
 * 4. Confirming funding to backend
 * 5. Polling until aggregation completes
 */
export const useObfuscationDeploy = () => {
  const { publicKey, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const utils = trpc.useUtils();

  const getObfuscationFundingTxs =
    trpc.routes.getObfuscationFundingTransactions.useMutation();
  const confirmFunding = trpc.routes.confirmAllObfuscationFunding.useMutation();

  /**
   * Poll obfuscation status until it reaches 'executing' or fails
   */
  const pollObfuscationStatus = async (
    routeId: number,
    maxAttempts: number = 60,
    intervalMs: number = 2000,
  ): Promise<{ status: string; isReady: boolean }> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = await utils.routes.getObfuscationStatus.fetch({ routeId });

      if (!result.success || !result.data) {
        throw new Error("Failed to get obfuscation status");
      }

      const { status, isReady } = result.data;

      if (status === "executing" || isReady) {
        return { status, isReady: true };
      }

      if (status === "failed") {
        throw new Error("Obfuscation failed");
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      toast.loading(
        `Waiting for aggregation... (${attempt + 1}/${maxAttempts})`,
        { id: "obfuscation" },
      );
    }

    throw new Error("Obfuscation timed out waiting for aggregation");
  };

  /**
   * Fund obfuscation intermediate wallets
   *
   * @param routeId - The route ID (database ID)
   * @returns Promise that resolves when obfuscation reaches 'executing' status
   */
  const fundObfuscation = async (routeId: number): Promise<void> => {
    if (!publicKey || !signAllTransactions) {
      toast.error("Please connect your wallet");
      throw new Error("Wallet not connected or doesn't support batch signing");
    }

    try {
      toast.loading("Preparing funding transactions...", { id: "obfuscation" });

      // 1. Get funding transactions from backend (one per intermediate wallet)
      const result = await getObfuscationFundingTxs.mutateAsync({
        routeId,
        creator: publicKey.toBase58(),
      });

      const { transactions, totalTransactions } = result.data;

      if (!transactions || transactions.length === 0) {
        toast.success("All wallets already funded!", { id: "obfuscation" });
        return;
      }

      toast.loading(
        `Please sign ${totalTransactions} funding transactions...`,
        { id: "obfuscation" },
      );

      // 2. Deserialize each transaction separately
      const deserializedTxs = transactions.map((txData) =>
        Transaction.from(Buffer.from(txData.serialized, "base64")),
      );

      // 3. Batch sign all transactions (single wallet popup)
      const signedTxs = await signAllTransactions(deserializedTxs);

      toast.loading("Sending funding transactions...", { id: "obfuscation" });

      // 4. Send each transaction individually and collect signatures
      const fundingResults: Array<{ walletIndex: number; txHash: string }> = [];

      for (let i = 0; i < signedTxs.length; i++) {
        const txData = transactions[i];
        const signedTx = signedTxs[i];

        toast.loading(`Sending transaction ${i + 1}/${totalTransactions}...`, {
          id: "obfuscation",
        });

        // Send the signed transaction
        const signature = await connection.sendRawTransaction(
          signedTx.serialize(),
          {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          },
        );

        toast.loading(
          `Confirming transaction ${i + 1}/${totalTransactions}...`,
          { id: "obfuscation" },
        );

        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(
          signature,
          "confirmed",
        );

        if (confirmation.value.err) {
          throw new Error(
            `Transaction ${i + 1} failed: ${JSON.stringify(confirmation.value.err)}`,
          );
        }

        fundingResults.push({
          walletIndex: txData.walletIndex,
          txHash: signature,
        });

        console.log(
          `Funding transaction ${i + 1}/${totalTransactions} confirmed: ${signature}`,
        );
      }

      toast.loading("Confirming funding to server...", { id: "obfuscation" });

      // 5. Confirm all funding to backend
      await confirmFunding.mutateAsync({
        routeId,
        fundingResults,
      });

      toast.loading("Waiting for aggregation to complete...", {
        id: "obfuscation",
      });

      // 6. Poll until obfuscation completes (aggregation → executing)
      await pollObfuscationStatus(routeId);

      toast.success("Obfuscation complete! Route is now active.", {
        id: "obfuscation",
      });
    } catch (error) {
      console.error("Obfuscation funding failed:", error);
      toast.error(`Obfuscation funding failed: ${extractErrorMessage(error)}`, {
        id: "obfuscation",
      });
      throw error;
    }
  };

  /**
   * Check if a route has an obfuscation session
   */
  const hasObfuscation = async (routeId: number): Promise<boolean> => {
    try {
      const result = await trpc.routes.getObfuscationSession
        .useQuery({
          routeId,
        })
        .refetch();
      if (!result) {
        return false;
      }
      console.log(`[hasObfuscation]: `, result);
      return result.data !== null && !!result.data?.success;
    } catch {
      return false;
    }
  };

  /**
   * Get obfuscation session status
   */
  const getStatus = async (routeId: number) => {
    const result = await trpc.routes.getObfuscationStatus
      .useQuery({ routeId })
      .refetch();
    return result.data;
  };

  return {
    fundObfuscation,
    hasObfuscation,
    getStatus,
    pollObfuscationStatus,
  };
};
