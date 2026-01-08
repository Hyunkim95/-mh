import { Buffer } from "buffer";
import { trpc } from "../trpc";
import { PublicKey } from "@solana/web3.js";
import toast from "react-hot-toast";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";

export const useUpdateTokenConfig = ({
  publicKey,
}: {
  publicKey: PublicKey | null;
}) => {
  const { sendTransaction } = useWallet();
  const { connection } = useConnection();

  const updateTokenConfig = trpc.contract.updateTokenConfig.useMutation();
  const updateTokenConfigSOL = trpc.contract.updateTokenConfigSOL.useMutation();

  const handleUpdateTokenConfig = async (data: any) => {
    try {
      const {  tokenConfig } = data;
      const transactionSignature = await updateTokenConfig.mutateAsync({
        tokenConfig,
        creator: publicKey?.toBase58() ?? "",
      });
      const transaction = Transaction.from(
        Buffer.from(transactionSignature.data.transaction, "base64")
      );
      const output = await connection.simulateTransaction(transaction);
      console.log("Simulation output:", output);
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: true,
      });
      const latestBlockhash = await connection.getLatestBlockhash();
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

      toast.success(
        `SPL Token config updated successfully! Signature: ${signature.slice(
          0,
          8
        )}...`
      );
    } catch (error) {
      console.error("SPL Token config update failed:", error);
      toast.error(
        `SPL Token config update failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  };

  const handleUpdateTokenConfigSOL = async (data: any) => {
    try {
      const { tokenConfig } = data;
      const transactionSignature = await updateTokenConfigSOL.mutateAsync({
        tokenConfig,
        creator: publicKey?.toBase58() ?? "",
      });

      const transaction = Transaction.from(
        Buffer.from(transactionSignature.data.transaction, "base64")
      );
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: true,
      });
      const latestBlockhash = await connection.getLatestBlockhash();
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

      toast.success(
        `SOL Token config updated successfully! Signature: ${signature.slice(
          0,
          8
        )}...`
      );
    } catch (error) {
      console.error("SOL Token config update failed:", error);
      toast.error(
        `SOL Token config update failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  };

  return {
    handleUpdateTokenConfig,
    handleUpdateTokenConfigSOL,
    tokenConfigPending: updateTokenConfig.isPending,
    solTokenConfigPending: updateTokenConfigSOL.isPending,
    tokenConfigError: updateTokenConfig.error,
    solTokenConfigError: updateTokenConfigSOL.error,
  };
};
