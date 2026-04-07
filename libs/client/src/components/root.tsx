import { QueryClientProvider } from "@tanstack/react-query";
import { trpc, trpcClient, queryClient } from "../trpc";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import {
  PhantomWalletAdapter,
} from '@solana/wallet-adapter-wallets'
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack'
import { MagicEdenWalletAdapter } from '@solana/wallet-adapter-magiceden'
import { TestWalletAdapter } from '../adapters/TestWalletAdapter'
import { useMemo } from 'react'
import { Toaster } from 'react-hot-toast'
import { UpdateBanner } from './UpdateBanner'
const endpoint =
  import.meta.env.VITE_RPC_URL || clusterApiUrl(WalletAdapterNetwork.Devnet)
interface RootProps {
  children: React.ReactNode;
}

export const Root = ({ children }: RootProps) => {
  const wallets = useMemo(() => {
    const base = [
      new PhantomWalletAdapter(),
      new BackpackWalletAdapter(),
      new MagicEdenWalletAdapter(),
    ];
    if (import.meta.env.VITE_TEST_WALLET === 'true') {
      base.push(new TestWalletAdapter() as any);
    }
    return base;
  }, []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider endpoint={endpoint}>
          <WalletProvider wallets={wallets} autoConnect>
            <WalletModalProvider>
              <UpdateBanner />
              {children}
              <Toaster position="top-right" />
            </WalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
};