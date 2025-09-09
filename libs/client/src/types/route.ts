import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export interface IHop {
  recipient: PublicKey;
  delaySeconds: BN;
}

export interface RouteConfig {
  creator: PublicKey;
  routeId: BN;
  tokenConfig: PublicKey;
  sourceOwner: PublicKey;
  executor: PublicKey;
  hops: {
    recipient: PublicKey;
    delaySeconds: BN;
  }[];
  hopAmount: BN;
  isFinalized: boolean;
  createdAt: BN;
}

export interface RouteStateAccount {
  currentHopIndex: number;
}

// Input types for client-side usage
export interface IHopInput {
  recipient: string;
  delaySeconds: string;
}

export interface InitializeRouteInput {
  routeId: number;
  routes: IHopInput[];
  tokenConfig: string;
  splToken: string;
}

export interface InitializeRouteSOLInput {
  routeId: number;
  routes: IHopInput[];
  tokenConfig: string;
}

export interface GetRouteConfigInput {
  routeId: number;
  creator: string;
  tokenConfig: string;
}

export interface InitializeRouteResponse {
  transaction: string;
  routeId: string;
}

export interface RouteConfigResponse {
  creator: string;
  routeId: string;
  tokenConfig: string;
  sourceOwner: string;
  executor: string;
  hops: {
    recipient: string;
    delaySeconds: string;
  }[];
  hopAmount: string;
  isFinalized: boolean;
  createdAt: string;
}

export interface RouteStateResponse {
  currentHopIndex: number;
}