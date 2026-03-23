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
 * 1. Getting funding transactions for intermediate wallets (only returns un-funded wallets)
 * 2. Batch signing all transactions (single wallet popup)
 * 3. Sending each transaction individually with per-transaction confirmation
 * 4. Confirming each successful funding to backend immediately (partial failure safe)
 */
export const useObfuscationDeploy = () => {
  const { publicKey, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const utils = trpc.useUtils();

  const getObfuscationFundingTxs =
    trpc.routes.getObfuscationFundingTransactions.useMutation();
  const confirmFunding = trpc.routes.confirmObfuscationFunding.useMutation();

  /**
   * Fund obfuscation intermediate wallets
   *
   * Uses per-transaction confirmation to prevent re-funding already-funded wallets
   * on retry. If a transaction fails mid-way, previous successful transactions
   * are already confirmed in the database.
   *
   * @param routeId - The route ID (database ID)
   * @returns Promise that resolves when all funding is confirmed and aggregation begins
   *
   * Status flow: pending -> funding -> aggregating -> deploying -> completed
   */
  const fundObfuscation = async (routeId: number): Promise<void> => {
    if (!publicKey || !signAllTransactions) {
      toast.error("Please connect your wallet");
      throw new Error("Wallet not connected or doesn't support batch signing");
    }

    try {
      toast.loading("Preparing funding transactions...", { id: "obfuscation" });

      // 1. Get funding transactions from backend (only returns un-funded wallets)
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

      // 4. Send each transaction individually with per-transaction confirmation
      // This ensures partial failures don't require re-funding already-funded wallets
      let successCount = 0;

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
          // Log the error but continue trying remaining transactions
          console.error(`Transaction ${i + 1} failed:`, confirmation.value.err);
          toast.error(
            `Transaction ${i + 1} failed, but continuing with remaining...`,
            { id: `obfuscation-error-${i}`, duration: 3000 },
          );
          continue; // Don't throw - try remaining transactions
        }

        // 5. Confirm this single funding to backend IMMEDIATELY
        // This prevents re-funding on retry if later transactions fail
        try {
          await confirmFunding.mutateAsync({
            routeId,
            walletIndex: txData.walletIndex,
            txHash: signature,
          });
          successCount++;
        } catch (confirmError) {
          console.error(`Failed to confirm wallet ${txData.walletIndex}:`, confirmError);
          // Transaction is on-chain but not confirmed in DB - server will handle on retry
        }
      }

      if (successCount === totalTransactions) {
        // Aggregation + deployment happens in background — don't claim success yet
        toast("Funding complete. Route deployment will begin shortly...", {
          id: "obfuscation",
          icon: "\u23F3",
          duration: 5000,
        });
      } else if (successCount > 0) {
        toast.success(
          `Funded ${successCount}/${totalTransactions} wallets. Retry to complete remaining.`,
          { id: "obfuscation" },
        );
      } else {
        throw new Error("All funding transactions failed");
      }
    } catch (error) {
      toast.error(`Abstraction funding failed: ${extractErrorMessage(error)}`, {
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
      const result = await utils.routes.getObfuscationSession.fetch({
        routeId,
      });
      if (!result) {
        return false;
      }
      return result.success === true;
    } catch (error) {
      return false;
    }
  };

  return {
    fundObfuscation,
    hasObfuscation,
  };
};
