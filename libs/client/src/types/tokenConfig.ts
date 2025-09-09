import { BN } from '@coral-xyz/anchor';

export interface TokenConfig {
  minTransfer: BN;
  feeBps: BN;
  feeTreasury: BN;
  maxHops: BN;
  maxDelaySeconds: BN;
  timelockSeconds: BN;
  flatFeeLamports: BN;
}

export interface TokenConfigInput {
  minTransfer: string;
  feeBps: string;
  feeTreasury: string;
  maxHops: string;
  maxDelaySeconds: string;
  timelockSeconds: string;
  flatFeeLamports: string;
}

export interface TokenConfigResponse {
  tokenConfig: any;
  initialized: boolean;
  tokenConfigPda?: string;
}

export interface InitializeTokenConfigResponse {
  transaction: string;
  tokenPairMint?: string;
  wsolMint?: string;
}