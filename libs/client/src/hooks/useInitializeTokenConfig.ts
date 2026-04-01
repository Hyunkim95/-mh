import { Buffer } from "buffer";
import { trpc } from "../trpc";
import { PublicKey } from "@solana/web3.js";
import toast from "react-hot-toast";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { extractErrorMessage } from "../utils/extractErrorMessage";
import { captureClientError } from "../utils/monitoring";

export const useInitializeTokenConfig = ({
  publicKey,
}: {
  publicKey: PublicKey | null;
}) => {
  const { sendTransaction, connect } = useWallet();
  const { connection } = useConnection();

  const initializeTokenConfig =
    trpc.contract.initializeTokenConfig.useMutation();
  const initializeTokenConfigSOL =
    trpc.contract.initializeTokenConfigSOL.useMutation();

  const handleIntiaizlizeTokenConfig = async (data: any) => {
    try {
      if (!publicKey) {
        // try connect with solana wallet
        await connect();
      }
      const { tokenConfig } = data;

      const transactionSignature = await initializeTokenConfig.mutateAsync({
        tokenConfig,
      });
      const transaction = Transaction.from(
        Buffer.from(transactionSignature.data.transaction, "base64")
      );
      const simulation = await connection.simulateTransaction(transaction);
      if (simulation.value.err) {
        throw new Error(
          `Simulation failed: ${JSON.stringify(simulation.value.err)}`
        );
      }
      const signature = await sendTransaction(transaction, connection);
      const confirmation = await connection.confirmTransaction(
        {
          signature: signature,
          blockhash: transactionSignature.data.recentBlockhash,
          lastValidBlockHeight: transactionSignature.data.lastValidBlockHeight,
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
      captureClientError(error, {
        area: "token-config",
        action: "initialize-spl-token-config",
      });
      toast.error(`SPL Token config creation failed: ${extractErrorMessage(error)}`);
      throw error;
    }
  };

  const handleIntiaizlizeTokenConfigSOL = async (data: any) => {
    try {
      if (!publicKey) {
        // try connect with solana wallet
        await connect();
      }
      const { tokenConfig } = data;
      const transactionSignature = await initializeTokenConfigSOL.mutateAsync({
        tokenConfig,
      });

      const transaction = Transaction.from(
        Buffer.from(transactionSignature.data.transaction, "base64")
      );
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: true,
      });
      const confirmation = await connection.confirmTransaction(
        {
          signature: signature,
          blockhash: transactionSignature.data.recentBlockhash,
          lastValidBlockHeight: transactionSignature.data.lastValidBlockHeight,
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
      captureClientError(error, {
        area: "token-config",
        action: "initialize-sol-token-config",
      });
      toast.error(`SOL Token config creation failed: ${extractErrorMessage(error)}`);
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
