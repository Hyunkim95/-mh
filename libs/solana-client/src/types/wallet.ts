import { PublicKey } from '@solana/web3.js';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';

export interface WalletInfo {
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  address: string | null;
}

export interface WalletConfig {
  network: WalletAdapterNetwork;
  endpoint?: string;
  autoConnect?: boolean;
}
