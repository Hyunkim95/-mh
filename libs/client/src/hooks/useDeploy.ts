import { Buffer } from "buffer";
import { toast } from "react-hot-toast";
import { Transaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { trpc } from "../trpc";

export const useDeploy = () => {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const initializeRoute = trpc.contract.initializeRoute.useMutation();
  const addHops = trpc.contract.addHops.useMutation();
  const initializeRouteSOL = trpc.contract.initializeRouteSOL.useMutation();
  const markDeployed = trpc.routes.markDeployed.useMutation();
  const checkRouteStatus = trpc.contract.routeHasHops.useMutation();

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
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
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
        `${type} Route deployment failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
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
    try {
      const result = await addHops.mutateAsync({
        routeId,
        creator,
        hops,
      });
      const transaction = Transaction.from(
        Buffer.from(result.data.transaction, "base64")
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
          blockhash: result.data.recentBlockhash,
          lastValidBlockHeight: result.data.lastValidBlockHeight,
        }
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }

    } catch (error) {
      console.error("Adding hops failed:", error);
      toast.error(
        `Adding hops failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  };

  const deploy = async (
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
      // Check if route is already deployed
      const routeStatus = await checkRouteStatus.mutateAsync({
        routeId: data.routeId
      });
      const { hasHops, isDeployed } = routeStatus.data || { hasHops: false, isDeployed: false };

      let totalSteps = 2;
      let currentStep = 0;

      // Show initial progress
      toast.loading(
        `Deploying route (Step ${currentStep + 1}/${totalSteps}): Checking status...`,
        { id: "deploy" }
      );

      if (!isDeployed) {
        // Step 1: Initialize route
        currentStep = 1;
        toast.loading(
          `Deploying route (Step ${currentStep}/${totalSteps}): Initializing route...`,
          { id: "deploy" }
        );

        const initSignature = await initializeRouteMutation(data, type);
        
        // Step 2: Add hops
        currentStep = 2;
        toast.loading(
          `Deploying route (Step ${currentStep}/${totalSteps}): Adding hops...`,
          { id: "deploy" }
        );

        await addHopsMutation(data.routeId, publicKey.toBase58(), data.hops);
        
        // Mark as deployed in database
        await markDeployed.mutateAsync({
          id: data.databaseId,
          creator: publicKey.toBase58(),
          deploymentTxHash: initSignature,
        });

        toast.success("Route deployed successfully with all hops!", { id: "deploy" });
        return initSignature;
      } else if (!hasHops) {
        // Route initialized but no hops - just add hops
        totalSteps = 1;
        currentStep = 1;
        toast.loading(
          `Adding hops (Step ${currentStep}/${totalSteps}): Processing...`,
          { id: "deploy" }
        );

        await addHopsMutation(data.routeId, publicKey.toBase58(), data.hops);
        
        toast.success("Hops added successfully!", { id: "deploy" });
        return "hops-added";
      } else {
        // Already fully deployed
        toast.success("Route is already fully deployed!", { id: "deploy" });
        return "already-deployed";
      }
    } catch (error) {
      console.error("Deployment failed:", error);
      toast.error(
        `Deployment failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        { id: "deploy" }
      );
      throw error;
    }
  };

  return {
    initializeRouteMutation,
    addHopsMutation,
    deploy
  };
};
