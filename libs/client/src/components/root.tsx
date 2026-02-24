import { QueryClientProvider } from "@tanstack/react-query";
import { trpc, trpcClient, queryClient } from "../trpc";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
// import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
// import { clusterApiUrl } from "@solana/web3.js";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets'
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack'
import { MagicEdenWalletAdapter } from '@solana/wallet-adapter-magiceden'
import { useMemo } from 'react'
import { Toaster } from 'react-hot-toast'
// const endpoint =
//   import.meta.env.VITE_RPC_URL || clusterApiUrl(WalletAdapterNetwork.Devnet)
const endpoint = 'https://devnet.helius-rpc.com/?api-key=f6d0c03a-562f-4784-8b78-ebb084b72514'
interface RootProps {
  children: React.ReactNode;
}

export const Root = ({ children }: RootProps) => {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
      new MagicEdenWalletAdapter(),
    ],
    []
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider endpoint={endpoint}>
          <WalletProvider wallets={wallets} autoConnect>
            <WalletModalProvider>
              {children}
              <Toaster position="top-right" />
            </WalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
};
