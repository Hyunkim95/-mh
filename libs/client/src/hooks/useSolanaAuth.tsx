import { Buffer } from "buffer";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useState } from "react";
import bs58 from "bs58";
import { Transaction } from "@solana/web3.js";
import { SystemProgram } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { TransactionInstruction } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { trpc, queryClient } from "../trpc";

export const useSolanaAuth = () => {
  const {
    data: userData,
    refetch: refetchUser,
    isFetching,
    isLoading,
    isFetched,
  } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { mutateAsync: createMessage, isPending } =
    trpc.auth.createMessage.useMutation();
  const {
    mutateAsync: verifyUserWithSignature,
    isPending: isVerifyUserWithSignaturePending,
  } = trpc.auth.verifyUserWithSignature.useMutation();

  const [error, setError] = useState<Error | null>(null);
  const [isWaitingForSignature, setIsWaitingForSignature] = useState(false);
  const {
    publicKey,
    signMessage,
    signTransaction,
    wallet: currentWallet,
    disconnect: disconnectWallet,
  } = useWallet();
  const { connection } = useConnection();

  const signForStandardWallet = useCallback(
    async (message: string): Promise<string> => {
      if (!signMessage) {
        throw new Error("Wallet does not support message signing");
      }

      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      return bs58.encode(signatureBytes);
    },
    [signMessage]
  );

  const signForHardwareWallet = useCallback(
    async (message: string): Promise<string> => {
      if (!signTransaction || !publicKey) {
        throw new Error("Hardware wallet signing not available");
      }

      const transaction = new Transaction();
      const recentBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = recentBlockhash.blockhash;
      transaction.feePayer = publicKey;

      // Add a dummy transfer instruction
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: publicKey,
          lamports: BigInt(0),
        })
      );

      // Add memo instruction with the message
      transaction.add(
        new TransactionInstruction({
          programId: new PublicKey(
            "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
          ),
          keys: [],
          data: Buffer.from(message, "utf8"),
        })
      );

      const signedTransaction = await signTransaction(transaction);
      return bs58.encode(signedTransaction.serialize());
    },
    [signTransaction, publicKey, connection]
  );

  const detectHardwareWallet = useCallback((): boolean => {
    if (!currentWallet) return false;

    // Common hardware wallet identifiers
    const hardwareWalletNames = ["Ledger", "Trezor", "Hardware Wallet"];

    return hardwareWalletNames.some((name) =>
      currentWallet.adapter.name.toLowerCase().includes(name.toLowerCase())
    );
  }, [currentWallet]);

  const authenticate = useCallback(async () => {
    if (!publicKey) {
      const error = new Error("Please connect your wallet first");
      setError(error);
      return;
    }

    setError(null);

    try {
      // Get nonce and message from backend
      const { nonce, message } = await createMessage();

      const isHardwareWallet = detectHardwareWallet();

      // Set waiting for signature state
      setIsWaitingForSignature(true);

      // Sign the message
      const signature = isHardwareWallet
        ? await signForHardwareWallet(message)
        : await signForStandardWallet(message);

      // Clear waiting state once signature is obtained
      setIsWaitingForSignature(false);

      // Send the signature to backend for verification
      const { token } = await verifyUserWithSignature({
        nonce: nonce,
        address: publicKey.toString(),
        signature,
        isHardwareWallet,
      });

      localStorage.setItem("token", token);
      await refetchUser();
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Authentication failed");
      setError(error);
      disconnectWallet();
      setIsWaitingForSignature(false);
    } finally {
    }
  }, [
    publicKey,
    detectHardwareWallet,
    signForHardwareWallet,
    signForStandardWallet,
    disconnectWallet,
  ]);

  const logout = useCallback(async () => {
    localStorage.removeItem("token");
    try {
      // Limpia el cache para evitar que userData previo permanezca en memoria
      await queryClient.cancelQueries();
      queryClient.clear();
    } finally {
      await refetchUser();
    }
  }, [refetchUser]);

  return {
    authenticate,
    isLoading,
    error,
    userData,
    logout,
    isFetched,
    isFetching,
    isPending,
    isVerifyUserWithSignaturePending,
    isWaitingForSignature,
  };
};
