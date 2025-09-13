export interface SolanaConnectRequest {
  signature: string;
  solanaAddress: string;
  referralCode?: string;
  isHardwareWallet?: boolean;
}

export interface GetNonceResponse {
  nonce: string;
  message?: string;
}

export interface AuthenticationAPI {
  initiateSolanaConnect: () => Promise<GetNonceResponse & { message: string }>;
  solanaConnect: (request: SolanaConnectRequest) => Promise<void>;
}