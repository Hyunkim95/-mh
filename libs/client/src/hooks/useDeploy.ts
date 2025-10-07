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
  const initializeRouteSOL = trpc.contract.initializeRouteSOL.useMutation();
  const markDeployed = trpc.routes.markDeployed.useMutation();

  const deploy = async (
    data: {
      routeId: number; // Contract route ID
      databaseId: number; // Database primary key ID
      routes: {
        recipient: string;
        delaySeconds: string;
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

      // Convert delaySeconds from string to number for the mutation
      const convertedRoutes = data.routes.map((route) => ({
        ...route,
        delaySeconds: parseInt(route.delaySeconds, 10),
      }));

      let transactionSignature;

      if (type === "SPL") {
        if (!data.splMint) {
          throw new Error("SPL mint address is required for SPL routes");
        }
        transactionSignature = await initializeRoute.mutateAsync({
          routeId: data.routeId,
          routes: convertedRoutes,
          hopAmount: data.hopAmount,
          creator: publicKey.toBase58(),
          splMint: data.splMint,
        });
      } else {
        transactionSignature = await initializeRouteSOL.mutateAsync({
          routeId: data.routeId,
          routes: convertedRoutes,
          hopAmount: data.hopAmount,
          creator: publicKey.toBase58(),
          splMint: "So11111111111111111111111111111111111111112", // Native SOL mint
        });
      }

      toast.loading("Please sign the transaction...", { id: "deploy" });

      const transaction = Transaction.from(
        Buffer.from(transactionSignature.data.transaction, "base64")
      );
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: true,
      });

      const latestBlockhash = await connection.getLatestBlockhash();

      toast.loading("Confirming transaction...", { id: "deploy" });

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(
        {
          signature: signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }

      // Mark route as deployed in the database
      await markDeployed.mutateAsync({
        id: data.databaseId,
        creator: publicKey.toBase58(),
        deploymentTxHash: signature,
      });

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

  return {
    deploy,
  };
};
