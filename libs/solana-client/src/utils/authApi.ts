import { SolanaConnectRequest, GetNonceResponse } from '../types/auth';

export interface AuthApiConfig {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class SolanaAuthAPI {
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(config: AuthApiConfig = {}) {
    this.baseUrl = config.baseUrl || '';
    this.fetchFn = config.fetch || fetch;
  }

  async initiateSolanaConnect(): Promise<GetNonceResponse & { message: string }> {
    const response = await this.fetchFn(`${this.baseUrl}/api/authentication/solana/initiate-connect`);
    
    if (!response.ok) {
      throw new Error(`Failed to initiate Solana connect: ${response.statusText}`);
    }
    
    return response.json();
  }

  async solanaConnect(request: SolanaConnectRequest): Promise<void> {
    const response = await this.fetchFn(`${this.baseUrl}/api/authentication/solana/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to connect Solana wallet: ${response.statusText}`);
    }
  }
}

// Default instance
export const defaultAuthAPI = new SolanaAuthAPI();