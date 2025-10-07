import { Buffer } from "buffer";
import { trpc } from "../trpc";
import { PublicKey } from "@solana/web3.js";
import toast from "react-hot-toast";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";

export const useInitializeTokenConfig = ({
  publicKey,
}: {
  publicKey: PublicKey | null;
}) => {
  const { sendTransaction } = useWallet();
  const { connection } = useConnection();

  const initializeTokenConfig =
    trpc.contract.initializeTokenConfig.useMutation();
  const initializeTokenConfigSOL =
    trpc.contract.initializeTokenConfigSOL.useMutation();

  const handleIntiaizlizeTokenConfig = async (data: any) => {
    try {
      const { address, tokenConfig } = data;

      const transactionSignature = await initializeTokenConfig.mutateAsync({
        splMint: address,
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
        `SPL Token config created successfully! Signature: ${signature.slice(
          0,
          8
        )}...`
      );
    } catch (error) {
      console.error("SPL Token config creation failed:", error);
      toast.error(
        `SPL Token config creation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  };

  const handleIntiaizlizeTokenConfigSOL = async (data: any) => {
    try {
      const { tokenConfig } = data;
      const transactionSignature = await initializeTokenConfigSOL.mutateAsync({
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
        `SOL Token config created successfully! Signature: ${signature.slice(
          0,
          8
        )}...`
      );
    } catch (error) {
      console.error("SOL Token config creation failed:", error);
      toast.error(
        `SOL Token config creation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  };

  return {
    handleIntiaizlizeTokenConfig,
    handleIntiaizlizeTokenConfigSOL,
    tokenConfigPending: initializeTokenConfig.isPending,
    solTokenConfigPending: initializeTokenConfigSOL.isPending,
    tokenConfigError: initializeTokenConfig.error,
    solTokenConfigError: initializeTokenConfigSOL.error,
  };
};
