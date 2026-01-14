import { Buffer } from "buffer";
import { toast } from "react-hot-toast";
import { Transaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { trpc } from "../trpc";
import { extractErrorMessage } from "../utils/extractErrorMessage";

// Maximum hops that can fit in a single transaction (matches backend)
const HOPS_PER_BATCH = 5;

/**
 * Recalculate hop times based on delay configuration
 * For delay-based hops: calculate fresh timestamp from now
 * For custom absolute times: keep original timestamp
 */
const recalculateHopTimes = (
  hops: Array<{
    recipient: string
    scheduledAt: number | string
    delayMinutes?: number
    isCustomTime?: boolean
  }>
): Array<{ recipient: string; scheduledAt: number }> => {
  const now = Date.now()
  let cumulativeTime = now
  let lastWasCustom = false

  return hops.map((hop) => {
    if (hop.isCustomTime) {
      // Custom time: keep original (convert to timestamp if needed)
      const scheduledAt = typeof hop.scheduledAt === 'number'
        ? hop.scheduledAt
        : new Date(hop.scheduledAt).getTime()
      lastWasCustom = true
      cumulativeTime = scheduledAt  // Update cumulative for next hop
      return {
        recipient: hop.recipient,
        scheduledAt
      }
    } else if (hop.delayMinutes !== undefined && !lastWasCustom) {
      // Delay-based after delay-based: recalculate from cumulative time
      cumulativeTime += hop.delayMinutes * 60 * 1000
      return {
        recipient: hop.recipient,
        scheduledAt: cumulativeTime
      }
    } else {
      // Delay-based after custom OR no delay info: use stored timestamp (backward compatibility)
      const scheduledAt = typeof hop.scheduledAt === 'number'
        ? hop.scheduledAt
        : new Date(hop.scheduledAt).getTime()
      lastWasCustom = false
      cumulativeTime = scheduledAt
      return {
        recipient: hop.recipient,
        scheduledAt
      }
    }
  })
}

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
      const confirmation = await connection.confirmTransaction(
        {
          signature: signature,
          blockhash: transactionSignature.data.recentBlockhash,
          lastValidBlockHeight: transactionSignature.data.lastValidBlockHeight,
        }
      );

      if (confirmation.value.err) {
        // Extract detailed error message from complex error objects
        const errDetails = typeof confirmation.value.err === 'object'
          ? JSON.stringify(confirmation.value.err)
          : String(confirmation.value.err);
        throw new Error(`Transaction failed on-chain: ${errDetails}`);
      }

      // CRITICAL: Verify the route was actually created on-chain
      // This catches cases where confirmation succeeds but tx actually failed
      toast.loading("Verifying route creation...", { id: "deploy" });

      const txDetails = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!txDetails) {
        throw new Error("Could not fetch transaction details for verification");
      }

      if (txDetails.meta?.err) {
        const errDetails = typeof txDetails.meta.err === 'object'
          ? JSON.stringify(txDetails.meta.err)
          : String(txDetails.meta.err);
        throw new Error(`Transaction failed on-chain: ${errDetails}`);
      }

      toast.success(
        `${type} Route initialized! Signature: ${signature.slice(0, 8)}...`,
        { id: "deploy" }
      );
      console.log("Route initialized with signature:", signature);

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
      const deserializedTxs = transactions.map(batchData =>
        Transaction.from(Buffer.from(batchData.transaction, "base64"))
      );

      // Show loading message
      toast.loading(
        `Please sign ${totalBatches} ${totalBatches === 1 ? 'transaction' : 'transactions'} in your wallet...`,
        { id: "deploy" }
      );

      // USER SIGNS ALL TRANSACTIONS AT ONCE - SINGLE WALLET POPUP
      const signedTransactions = await signAllTransactions(deserializedTxs);

      toast.loading(
        `Submitting ${totalBatches} ${totalBatches === 1 ? 'batch' : 'batches'}...`,
        { id: "deploy" }
      );

      // OPTIMIZATION: Send all transactions quickly to avoid blockhash expiration
      // With 5+ batches, sequential send+confirm can exceed blockhash validity (~60s)
      const signatures: string[] = [];

      // Step 1: Send all transactions rapidly (don't wait for confirmation yet)
      for (let i = 0; i < signedTransactions.length; i++) {
        const batchNum = i + 1;
        const signedTx = signedTransactions[i];

        toast.loading(
          `Sending batch ${batchNum}/${totalBatches}...`,
          { id: "deploy" }
        );

        const signature = await connection.sendRawTransaction(
          signedTx.serialize(),
          {
            skipPreflight: true,
            preflightCommitment: "confirmed",
          }
        );

        signatures.push(signature);
        console.log(`Batch ${batchNum}/${totalBatches} sent: ${signature}`);

        // Small delay between sends to help ensure transaction ordering
        // Without this, validators might process batches out of order
        if (i < signedTransactions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Step 2: Now confirm all transactions
      toast.loading(
        `Confirming ${totalBatches} ${totalBatches === 1 ? 'batch' : 'batches'}...`,
        { id: "deploy" }
      );

      for (let i = 0; i < signatures.length; i++) {
        const batchNum = i + 1;
        const signature = signatures[i];
        const batchData = transactions[i];

        toast.loading(
          `Confirming batch ${batchNum}/${totalBatches}...`,
          { id: "deploy" }
        );

        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(
          {
            signature: signature,
            blockhash: batchData.recentBlockhash,
            lastValidBlockHeight: batchData.lastValidBlockHeight,
          }
        );

        if (confirmation.value.err) {
          const errDetails = typeof confirmation.value.err === 'object'
            ? JSON.stringify(confirmation.value.err)
            : String(confirmation.value.err);
          throw new Error(`Batch ${batchNum} transaction failed: ${errDetails}`);
        }

        // Double-check transaction actually succeeded by fetching tx details
        const txDetails = await connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (txDetails?.meta?.err) {
          const errDetails = typeof txDetails.meta.err === 'object'
            ? JSON.stringify(txDetails.meta.err)
            : String(txDetails.meta.err);
          throw new Error(`Batch ${batchNum} failed on-chain: ${errDetails}`);
        }

        console.log(`Batch ${batchNum}/${totalBatches} confirmed: ${signature}`);
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
        delayMinutes?: number;        // Optional delay metadata
        isCustomTime?: boolean;       // Flag for custom times
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
        routeId: data.routeId
      });
      const { hasHops, isDeployed } = routeStatus.data || { hasHops: false, isDeployed: false };

      // Calculate number of hop batches needed
      const hopBatches = Math.ceil(freshHops.length / HOPS_PER_BATCH);

      // Show initial progress
      toast.loading("Deploying route: Checking status...", { id: "deploy" });

      if (!isDeployed) {
        // Step 1: Initialize route
        toast.loading("Deploying route: Initializing...", { id: "deploy" });

        const initSignature = await initializeRouteMutation({ ...data, hops: freshHops }, type);

        // CRITICAL: Verify route was actually created on-chain before adding hops
        // This prevents the case where init tx fails but we still try to add hops
        // Add retry logic to handle RPC propagation delay
        let initVerifyAttempts = 0;
        const maxInitAttempts = 5;
        let isRouteCreated = false;

        while (initVerifyAttempts < maxInitAttempts && !isRouteCreated) {
          initVerifyAttempts++;

          toast.loading(
            `Verifying route creation${initVerifyAttempts > 1 ? ` (attempt ${initVerifyAttempts}/${maxInitAttempts})` : ''}...`,
            { id: "deploy" }
          );

          if (initVerifyAttempts > 1) {
            // Wait 2 seconds between attempts (except first attempt)
            await new Promise(resolve => setTimeout(resolve, 2000));
          }

          const postInitStatus = await utils.client.contract.routeHasHops.query({
            routeId: data.routeId
          });

          isRouteCreated = postInitStatus.data?.isDeployed || false;

          if (isRouteCreated) {
            console.log(`Route creation verified on attempt ${initVerifyAttempts}`);
            break;
          }
        }

        if (!isRouteCreated) {
          throw new Error(
            "Route initialization failed - route does not exist on-chain. " +
            "Please check your wallet balance and try again."
          );
        }

        // Step 2: Add hops (may require multiple batches)
        toast.loading(
          `Deploying route: Adding ${freshHops.length} hops${hopBatches > 1 ? ` in ${hopBatches} batches` : ""}...`,
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
            `Verifying deployment${verifyAttempts > 1 ? ` (attempt ${verifyAttempts}/${maxAttempts})` : ''}...`,
            { id: "deploy" }
          );

          if (verifyAttempts > 1) {
            // Wait 3 seconds between attempts (except first attempt)
            await new Promise(resolve => setTimeout(resolve, 3000));
            console.log(`Verification attempt ${verifyAttempts}/${maxAttempts}...`);
          }

          const verifyStatus = await utils.client.contract.routeHasHops.query({
            routeId: data.routeId
          });

          hasHops = verifyStatus.data?.hasHops || false;

          if (hasHops) {
            console.log(`Verification successful on attempt ${verifyAttempts}`);
            break;
          }
        }

        if (!hasHops) {
          throw new Error(
            "Hops were not added to the route on-chain. " +
            "The route was initialized but deployment is incomplete. " +
            "Please try deploying again."
          );
        }

        // Mark as deployed in database ONLY after hops are verified on-chain
        await markDeployed.mutateAsync({
          id: data.databaseId,
          creator: publicKey.toBase58(),
          deploymentTxHash: initSignature,
        });

        // Invalidate queries to refresh UI with latest on-chain state
        await utils.routes.getByCreator.invalidate();
        await utils.contract.getRouteState.invalidate({ routeId: data.routeId });

        toast.success(
          `Route deployed successfully with ${freshHops.length} hops!`,
          { id: "deploy" }
        );
        return initSignature;
      } else if (!hasHops) {
        // Route initialized but no hops - just add hops
        toast.loading(
          `Adding ${freshHops.length} hops${hopBatches > 1 ? ` in ${hopBatches} batches` : ""}...`,
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
            `Verifying hops were added${verifyAttempts > 1 ? ` (attempt ${verifyAttempts}/${maxAttempts})` : ''}...`,
            { id: "deploy" }
          );

          if (verifyAttempts > 1) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            console.log(`Verification attempt ${verifyAttempts}/${maxAttempts}...`);
          }

          const verifyStatus = await utils.client.contract.routeHasHops.query({
            routeId: data.routeId
          });

          hasHopsVerified = verifyStatus.data?.hasHops || false;

          if (hasHopsVerified) {
            console.log(`Verification successful on attempt ${verifyAttempts}`);
            break;
          }
        }

        if (!hasHopsVerified) {
          throw new Error(
            "Hops were not added to the route on-chain. " +
            "Please try adding hops again."
          );
        }

        // Invalidate queries to refresh UI with latest on-chain state
        await utils.routes.getByCreator.invalidate();
        await utils.contract.getRouteState.invalidate({ routeId: data.routeId });

        toast.success(
          `${freshHops.length} hops added successfully!`,
          { id: "deploy" }
        );
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
    deploy
  };
};
