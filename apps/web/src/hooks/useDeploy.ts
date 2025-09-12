import { toast } from "react-hot-toast";
import { Transaction } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { trpc } from "../lib/trpc";

export const useDeploy = () => {
  const { publicKey , sendTransaction} = useWallet();
  const { connection } = useConnection();
  const initializeRoute = trpc.contract.initializeRoute.useMutation();
  const initializeRouteSOL = trpc.contract.initializeRouteSOL.useMutation();
  
  const deploy = async (data: {
    routeId: number;
    routes: {
      recipient: string;
      delaySeconds: string;
    }[];
    hopAmount: string;
    splMint?: string;
  }, type: 'SPL' | 'SOL') => {
    try {
      const mutation = type === 'SPL' ? initializeRoute : initializeRouteSOL;
      
      // Convert delaySeconds from string to number for the mutation
      const convertedRoutes = data.routes.map(route => ({
        ...route,
        delaySeconds: parseInt(route.delaySeconds, 10)
      }));
      
      const transactionSignature = await mutation.mutateAsync({
        ...data,
        routes: convertedRoutes,
        splMint: data.splMint ?? NATIVE_MINT.toBase58(),
        creator: publicKey?.toBase58() ?? '',
      });
      
      const transaction = Transaction.from(Buffer.from(transactionSignature.data.transaction, "base64"));
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: true,
      });

      const latestBlockhash = await connection.getLatestBlockhash();

      const confirmation = await connection.confirmTransaction({
        signature: signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }
      
      toast.success(`Route created successfully! Signature: ${signature.slice(0, 8)}...`);
      console.log('Route created with signature:', signature);
    } catch (error) {
      console.error('Route creation failed:', error);
      toast.error(`Route creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  };

  return {
    deploy,
  };
};
