import { generateNonce, SiweMessage, VerifyParams, SiweResponse } from 'siwe';

export interface EthereumAuthConfig {
  /**
   * Custom domain for SIWE messages (defaults to 'localhost')
   */
  domain?: string;
  /**
   * Statement to include in SIWE messages
   */
  statement?: string;
  /**
   * URI for the SIWE message (defaults to current origin)
   */
  uri?: string;
  /**
   * SIWE version (defaults to '1')
   */
  version?: string;
  /**
   * Chain ID for the network (defaults to 1 for Ethereum mainnet)
   */
  chainId?: number;
}

export interface SiweVerificationOptions {
  signature: string;
  nonce: string;
  domain?: string;
  time?: Date;
}

export class EthereumAuthentication {
  private config: Required<EthereumAuthConfig>;

  constructor(config: EthereumAuthConfig = {}) {
    this.config = {
      domain: config.domain || 'localhost',
      statement: config.statement || 'Sign in with Ethereum to the app.',
      uri: config.uri || 'http://localhost:3000',
      version: config.version || '1',
      chainId: config.chainId || 1,
    };
  }

  /**
   * Generate a cryptographically secure nonce
   */
  generateNonce(): string {
    return generateNonce();
  }

  /**
   * Create a SIWE message
   */
  createMessage(fields: Partial<SiweMessage>): SiweMessage {
    const messageFields: Partial<SiweMessage> = {
      domain: this.config.domain,
      statement: this.config.statement,
      uri: this.config.uri,
      version: this.config.version,
      chainId: this.config.chainId,
      ...fields,
    };

    return new SiweMessage(messageFields);
  }

  /**
   * Verify a SIWE message signature
   * @param message - The SIWE message (can be partial fields or full SiweMessage)
   * @param options - Verification options including signature and nonce
   * @returns Promise<string> - The verified address
   */
  async verify(
    message: Partial<SiweMessage> | SiweMessage,
    options: SiweVerificationOptions
  ): Promise<string> {
    const { signature, nonce, domain, time } = options;

    if (!signature) {
      throw new Error('Missing signature');
    }

    if (!nonce) {
      throw new Error('Missing nonce');
    }

    try {
      let siweMessage: SiweMessage;
      
      if (message instanceof SiweMessage) {
        siweMessage = message;
      } else {
        siweMessage = this.createMessage(message);
      }

      const verifyParams: VerifyParams = {
        signature,
        nonce,
        time: time instanceof Date ? time.toISOString() : time,
      };

      if (domain) {
        verifyParams.domain = domain;
      }

      const result: SiweResponse = await siweMessage.verify(verifyParams);
      
      if (!result.success) {
        throw new Error(`SIWE verification failed: ${result.error?.type || 'Unknown error'}`);
      }

      return result.data.address;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Error validating signature: ${error}`);
    }
  }

  /**
   * Verify a SIWE message signature directly from string
   * @param messageString - The SIWE message as a string
   * @param signature - The signature to verify
   * @param nonce - The nonce used in the message
   * @returns Promise<string> - The verified address
   */
  async verifyMessageString(
    messageString: string,
    signature: string, 
    nonce: string
  ): Promise<string> {
    if (!messageString) {
      throw new Error('Missing message');
    }

    try {
      const siweMessage = new SiweMessage(messageString);
      
      const result = await siweMessage.verify({
        signature,
        nonce,
      });

      if (!result.success) {
        throw new Error(`SIWE verification failed: ${result.error?.type || 'Unknown error'}`);
      }

      return result.data.address;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Error validating message string: ${error}`);
    }
  }

  /**
   * Create nonce and message template in one call
   */
  createChallenge(address: string, overrides?: Partial<SiweMessage>): {
    nonce: string;
    message: SiweMessage;
    messageString: string;
  } {
    const nonce = this.generateNonce();
    const message = this.createMessage({
      address,
      nonce,
      issuedAt: new Date().toISOString(),
      ...overrides,
    });
    
    return {
      nonce,
      message,
      messageString: message.prepareMessage(),
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EthereumAuthConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<EthereumAuthConfig> {
    return { ...this.config };
  }
}

// Export a default instance
export const ethereumAuth = new EthereumAuthentication();

// Export utility functions for convenience
export function generateNonce_(): string {
  return ethereumAuth.generateNonce();
}

export function createSiweMessage(fields: Partial<SiweMessage>): SiweMessage {
  return ethereumAuth.createMessage(fields);
}

export function verifySiweMessage(
  message: Partial<SiweMessage> | SiweMessage,
  options: SiweVerificationOptions
): Promise<string> {
  return ethereumAuth.verify(message, options);
}

export function createSiweChallenge(
  address: string,
  overrides?: Partial<SiweMessage>
): { nonce: string; message: SiweMessage; messageString: string } {
  return ethereumAuth.createChallenge(address, overrides);
}

// Re-export SIWE types for convenience
export type { SiweMessage, VerifyParams, SiweResponse } from 'siwe';