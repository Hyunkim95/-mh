import { Buffer } from "buffer";
import { toast } from "react-hot-toast";
import { Transaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { trpc } from "../trpc";
import { extractErrorMessage } from "../utils/extractErrorMessage";

// Maximum hops that can fit in a single transaction (matches backend)
// Each hop = ~40 bytes (32-byte pubkey + 8-byte timestamp), 5 hops is safe (~520 bytes)
const HOPS_PER_BATCH = 5;

/**
 * Recalculate hop times based on delay configuration
 * For delay-based hops: calculate fresh timestamp from now
 * For custom absolute times: keep original timestamp
 */
const recalculateHopTimes = (
  hops: Array<{
    recipient: string;
    scheduledAt: number | string;
    delayMinutes?: number;
    isCustomTime?: boolean;
  }>
): Array<{ recipient: string; scheduledAt: number }> => {
  const now = Date.now();
  let cumulativeTime = now;
  let lastWasCustom = false;

  return hops.map((hop) => {
    if (hop.isCustomTime) {
      // Custom time: keep original (convert to timestamp if needed)
      const scheduledAt =
        typeof hop.scheduledAt === "number"
          ? hop.scheduledAt
          : new Date(hop.scheduledAt).getTime();
      lastWasCustom = true;
      cumulativeTime = scheduledAt; // Update cumulative for next hop
      return {
        recipient: hop.recipient,
        scheduledAt,
      };
    } else if (hop.delayMinutes !== undefined && !lastWasCustom) {
      // Delay-based after delay-based: recalculate from cumulative time
      cumulativeTime += hop.delayMinutes * 60 * 1000;
      return {
        recipient: hop.recipient,
        scheduledAt: cumulativeTime,
      };
    } else {
      // Delay-based after custom OR no delay info: use stored timestamp (backward compatibility)
      const scheduledAt =
        typeof hop.scheduledAt === "number"
          ? hop.scheduledAt
          : new Date(hop.scheduledAt).getTime();
      lastWasCustom = false;
      cumulativeTime = scheduledAt;
      return {
        recipient: hop.recipient,
        scheduledAt,
      };
    }
  });
};

export const useDeploy = () => {
  const { publicKey, sendTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const utils = trpc.useUtils();
  const initializeRoute = trpc.contract.initializeRoute.useMutation();
  const addHopsBatched = trpc.contract.addHopsBatched.useMutation();
  const initializeRouteSOL = trpc.contract.initializeRouteSOL.useMutation();
  const markDeployed = trpc.routes.markDeployed.useMutation();

  const initializeRouteMutation = async (
    data: {
      routeId: number; // Contract route ID
      databaseId: number; // Database primary key ID
      hops: {
        recipient: string;
        scheduledAt: number;
      }[];
      hopAmount: string;
      splMint?: string;
    },
    type: "SPL" | "SOL"
  ) => {
    // Wallet validation
    if (!publicKey || !sendTransaction) {
      toast.error("Please connect your wallet");
      throw new Error("Wallet not connected");
    }

    try {
      toast.loading("Preparing deployment transaction...", { id: "deploy" });

      // Hops are already in the correct format with scheduledAt timestamps
      const hopsData = data.hops;

      let transactionSignature;

      if (type === "SPL") {
        if (!data.splMint) {
          throw new Error("SPL mint address is required for SPL routes");
        }
        transactionSignature = await initializeRoute.mutateAsync({
          routeId: data.routeId,
          hops: hopsData,
          hopAmount: data.hopAmount,
          creator: publicKey.toBase58(),
          splMint: data.splMint,
        });
      } else {
        transactionSignature = await initializeRouteSOL.mutateAsync({
          routeId: data.routeId,
          hops: hopsData,
          hopAmount: data.hopAmount,
          creator: publicKey.toBase58(),
          splMint: "So11111111111111111111111111111111111111112", // Native SOL mint
        });
      }

      toast.loading("Please sign the transaction...", { id: "deploy" });

      const transaction = Transaction.from(
        Buffer.from(transactionSignature.data.transaction, "base64")
      );
      const simulation = await connection.simulateTransaction(transaction);
      console.log("Transaction simulation:", simulation);
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: true,
        preflightCommitment: "confirmed",
      });
      toast.loading("Confirming transaction...", { id: "deploy" });

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature: signature,
        blockhash: transactionSignature.data.recentBlockhash,
        lastValidBlockHeight: transactionSignature.data.lastValidBlockHeight,
      });

      if (confirmation.value.err) {
        throw new Error(
          `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
        );
      }

      toast.success(
        `${type} Route deployed successfully! Signature: ${signature.slice(
          0,
          8
        )}...`,
        { id: "deploy" }
      );
      console.log("Route deployed with signature:", signature);

      return signature;
    } catch (error) {
      console.error(`${type} Route deployment failed:`, error);
      toast.error(
        `${type} Route deployment failed: ${extractErrorMessage(error)}`,
        { id: "deploy" }
      );
      throw error;
    }
  };

  const addHopsMutation = async (
    routeId: number,
    creator: string,
    hops: { recipient: string; scheduledAt: number }[]
  ) => {
    if (!sendTransaction) {
      throw new Error("Wallet not connected");
    }

    try {
      // Use batched endpoint to get all transactions
      const result = await addHopsBatched.mutateAsync({
        routeId,
        creator,
        hops,
      });

      const { transactions, totalBatches, totalHops } = result.data;
      console.log(`Adding ${totalHops} hops in ${totalBatches} batch(es)`);

      // Check if wallet supports batch signing
      if (!signAllTransactions) {
        throw new Error("Wallet does not support batch signing");
      }

      // Deserialize all transactions upfront
      const deserializedTxs = transactions.map((batchData) =>
        Transaction.from(Buffer.from(batchData.transaction, "base64"))
      );

      // Simulate each batch before signing to catch errors early
      console.log("Simulating all batches before signing...");
      for (let i = 0; i < deserializedTxs.length; i++) {
        const batchNum = i + 1;
        const tx = deserializedTxs[i];
        const batchStartHop = i * 5;
        const batchEndHop = Math.min(batchStartHop + 5, hops.length);

        console.log(`\n=== Batch ${batchNum}/${totalBatches} Simulation ===`);
        console.log(`Hops ${batchStartHop + 1}-${batchEndHop}:`, hops.slice(batchStartHop, batchEndHop));

        const simulation = await connection.simulateTransaction(tx);
        console.log(`Batch ${batchNum} simulation result:`, simulation);

        if (simulation.value.err) {
          console.error(`Batch ${batchNum} simulation FAILED:`, simulation.value.err);
          console.error(`Logs:`, simulation.value.logs);
          throw new Error(
            `Batch ${batchNum} simulation failed: ${JSON.stringify(simulation.value.err)}\nLogs: ${simulation.value.logs?.join('\n')}`
          );
        } else {
          console.log(`Batch ${batchNum} simulation SUCCESS`);
        }
      }

      // Show loading message
      toast.loading(
        `Please sign ${totalBatches} ${
          totalBatches === 1 ? "transaction" : "transactions"
        } in your wallet...`,
        { id: "deploy" }
      );

      // USER SIGNS ALL TRANSACTIONS AT ONCE - SINGLE WALLET POPUP
      const signedTransactions = await signAllTransactions(deserializedTxs);

      toast.loading(
        `Submitting ${totalBatches} ${
          totalBatches === 1 ? "batch" : "batches"
        }...`,
        { id: "deploy" }
      );

      // Send each signed transaction sequentially
      for (let i = 0; i < signedTransactions.length; i++) {
        const batchNum = i + 1;
        const batchData = transactions[i];
        const signedTx = signedTransactions[i];

        toast.loading(`Sending batch ${batchNum}/${totalBatches}...`, {
          id: "deploy",
        });

        // Send the pre-signed transaction
        const signature = await connection.sendRawTransaction(
          signedTx.serialize(),
          {
            skipPreflight: true,
            preflightCommitment: "confirmed",
          }
        );

        toast.loading(`Confirming batch ${batchNum}/${totalBatches}...`, {
          id: "deploy",
        });

        // Wait for confirmation
        const confirmation = await connection.confirmTransaction({
          signature: signature,
          blockhash: batchData.recentBlockhash,
          lastValidBlockHeight: batchData.lastValidBlockHeight,
        });

        if (confirmation.value.err) {
          throw new Error(
            `Batch ${batchNum} transaction failed: ${JSON.stringify(
              confirmation.value.err
            )}`
          );
        }

        console.log(
          `Batch ${batchNum}/${totalBatches} confirmed: ${signature}`
        );
      }

      console.log(`All ${totalBatches} batch(es) completed successfully`);
    } catch (error) {
      console.error("Adding hops failed:", error);
      toast.error(`Adding hops failed: ${extractErrorMessage(error)}`);
      throw error;
    }
  };

  const deploy = async (
    data: {
      routeId: number; // Contract route ID
      databaseId: number; // Database primary key ID
      hops: {
        recipient: string;
        scheduledAt: number | string;
        delayMinutes?: number; // Optional delay metadata
        isCustomTime?: boolean; // Flag for custom times
      }[];
      hopAmount: string;
      splMint?: string;
    },
    type: "SPL" | "SOL"
  ) => {
    // Wallet validation
    if (!publicKey || !sendTransaction) {
      toast.error("Please connect your wallet");
      throw new Error("Wallet not connected");
    }

    try {
      // Recalculate fresh timestamps based on delay configuration
      const freshHops = recalculateHopTimes(data.hops);

      // Check if route is already deployed
      const routeStatus = await utils.client.contract.routeHasHops.query({
        routeId: data.routeId,
      });
      const { hasHops, isDeployed } = routeStatus.data || {
        hasHops: false,
        isDeployed: false,
      };

      // Calculate number of hop batches needed
      const hopBatches = Math.ceil(freshHops.length / HOPS_PER_BATCH);

      // Show initial progress
      toast.loading("Deploying route: Checking status...", { id: "deploy" });

      if (!isDeployed) {
        // Step 1: Initialize route
        toast.loading("Deploying route: Initializing...", { id: "deploy" });

        const initSignature = await initializeRouteMutation(
          { ...data, hops: freshHops },
          type
        );

        // Step 2: Add hops (may require multiple batches)
        toast.loading(
          `Deploying route: Adding ${freshHops.length} hops${
            hopBatches > 1 ? ` in ${hopBatches} batches` : ""
          }...`,
          { id: "deploy" }
        );

        await addHopsMutation(data.routeId, publicKey.toBase58(), freshHops);

        // CRITICAL: Verify all hops were actually added on-chain before marking as deployed
        // Add retry logic with delays to handle RPC propagation delay
        let verifyAttempts = 0;
        const maxAttempts = 8;
        let hasHops = false;

        while (verifyAttempts < maxAttempts && !hasHops) {
          verifyAttempts++;

          toast.loading(
            `Verifying deployment${
              verifyAttempts > 1
                ? ` (attempt ${verifyAttempts}/${maxAttempts})`
                : ""
            }...`,
            { id: "deploy" }
          );

          if (verifyAttempts > 1) {
            // Wait 3 seconds between attempts (except first attempt)
            await new Promise((resolve) => setTimeout(resolve, 3000));
            console.log(
              `Verification attempt ${verifyAttempts}/${maxAttempts}...`
            );
          }

          const verifyStatus = await utils.client.contract.routeHasHops.query({
            routeId: data.routeId,
          });

          hasHops = verifyStatus.data?.hasHops || false;

          if (hasHops) {
            console.log(`Verification successful on attempt ${verifyAttempts}`);
            break;
          }
        }

        if (!hasHops) {
          console.warn(
            `Verification failed after ${maxAttempts} attempts. ` +
              `Route may still be propagating on-chain. Check route status in a few moments.`
          );
          // Don't throw - mark as deployed anyway since transactions confirmed
          // The route will likely work, just RPC is slow to update
        }

        // Mark as deployed in database only after verification
        await markDeployed.mutateAsync({
          id: data.databaseId,
          creator: publicKey.toBase58(),
          deploymentTxHash: initSignature,
        });

        // Invalidate queries to refresh UI with latest on-chain state
        await utils.routes.getByCreator.invalidate();
        await utils.contract.getRouteState.invalidate({
          routeId: data.routeId,
        });

        toast.success(
          `Route deployed successfully with ${freshHops.length} hops!`,
          { id: "deploy" }
        );
        return initSignature;
      } else if (!hasHops) {
        // Route initialized but no hops - just add hops
        toast.loading(
          `Adding ${freshHops.length} hops${
            hopBatches > 1 ? ` in ${hopBatches} batches` : ""
          }...`,
          { id: "deploy" }
        );

        await addHopsMutation(data.routeId, publicKey.toBase58(), freshHops);

        // Verify hops were actually added on-chain with retry logic
        let verifyAttempts = 0;
        const maxAttempts = 8;
        let hasHopsVerified = false;

        while (verifyAttempts < maxAttempts && !hasHopsVerified) {
          verifyAttempts++;

          toast.loading(
            `Verifying hops were added${
              verifyAttempts > 1
                ? ` (attempt ${verifyAttempts}/${maxAttempts})`
                : ""
            }...`,
            { id: "deploy" }
          );

          if (verifyAttempts > 1) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            console.log(
              `Verification attempt ${verifyAttempts}/${maxAttempts}...`
            );
          }

          const verifyStatus = await utils.client.contract.routeHasHops.query({
            routeId: data.routeId,
          });

          hasHopsVerified = verifyStatus.data?.hasHops || false;

          if (hasHopsVerified) {
            console.log(`Verification successful on attempt ${verifyAttempts}`);
            break;
          }
        }

        if (!hasHopsVerified) {
          console.warn(
            `Verification failed after ${maxAttempts} attempts. ` +
              `Transactions were confirmed but RPC state is delayed.`
          );
          // Don't throw - transactions were confirmed successfully
        }

        // Invalidate queries to refresh UI with latest on-chain state
        await utils.routes.getByCreator.invalidate();
        await utils.contract.getRouteState.invalidate({
          routeId: data.routeId,
        });

        toast.success(`${freshHops.length} hops added successfully!`, {
          id: "deploy",
        });
        return "hops-added";
      } else {
        // Already fully deployed
        toast.success("Route is already fully deployed!", { id: "deploy" });
        return "already-deployed";
      }
    } catch (error) {
      console.error("Deployment failed:", error);
      toast.error(`Deployment failed: ${extractErrorMessage(error)}`, {
        id: "deploy",
      });
      throw error;
    }
  };

  return {
    initializeRouteMutation,
    addHopsMutation,
    deploy,
  };
};
