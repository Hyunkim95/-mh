export interface EvmConnectRequest {
  message: string;
  signature: string;
  referralCode?: string;
}

export interface GetNonceResponse {
  nonce: string;
}

export interface SiweMessageFields {
  domain: string;
  address: string;
  statement?: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt?: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

export interface IEthereumAuthAPI {
  initiateEvmConnect: () => Promise<GetNonceResponse>;
  evmConnect: (request: EvmConnectRequest) => Promise<void>;
}