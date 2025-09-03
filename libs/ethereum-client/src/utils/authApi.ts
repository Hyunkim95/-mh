import { EvmConnectRequest, GetNonceResponse } from '../types/auth';

export interface EthereumAuthApiConfig {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class EthereumAuthAPI {
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(config: EthereumAuthApiConfig = {}) {
    this.baseUrl = config.baseUrl || '';
    this.fetchFn = config.fetch || fetch;
  }

  async initiateEvmConnect(): Promise<GetNonceResponse> {
    const response = await this.fetchFn(`${this.baseUrl}/api/authentication/evm/initiate-connect`);
    
    if (!response.ok) {
      throw new Error(`Failed to initiate EVM connect: ${response.statusText}`);
    }
    
    return response.json();
  }

  async evmConnect(request: EvmConnectRequest): Promise<void> {
    const response = await this.fetchFn(`${this.baseUrl}/api/authentication/evm/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to connect EVM wallet: ${response.statusText}`);
    }
  }
}

// Default instance
export const defaultEthereumAuthAPI = new EthereumAuthAPI();