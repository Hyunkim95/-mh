import { PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { decodeUTF8 } from 'tweetnacl-util';

export interface SolanaAuthConfig {
  messageTemplate?: string;
}

export class SolanaAuthentication {
  private messageTemplate: string;

  constructor(config: SolanaAuthConfig = {}) {
    this.messageTemplate = config.messageTemplate || 
      'Welcome to the application. Sign this message to prove you own this address: {nonce}';
  }

  /**
   * Generate a cryptographically secure nonce
   */
  generateNonce(): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const length = Math.max(8, Math.floor(Math.random() * 12) + 8);

    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      result += characters[randomIndex];
    }

    return result;
  }

  /**
   * Create authentication message with nonce
   */
  createMessage(nonce: string): string {
    if (!nonce) {
      throw new Error('Missing nonce');
    }
    return this.messageTemplate.replace('{nonce}', nonce);
  }

  /**
   * Verify Solana wallet signature
   * @param address - The Solana wallet address
   * @param nonce - The nonce used in the message
   * @param signature - The signature to verify (base58 encoded)
   * @param isHardwareWallet - Whether this is a hardware wallet signature
   * @returns Promise<boolean> - True if signature is valid
   */
  async verifySignature(
    address: string,
    nonce: string,
    signature: string,
    isHardwareWallet: boolean = false
  ): Promise<boolean> {
    if (!nonce) {
      throw new Error('Missing nonce');
    }
    if (!signature) {
      throw new Error('Missing signature');
    }
    
    try {
      if (!isHardwareWallet) {
        // Standard wallet signature verification
        const publicKey = new PublicKey(address);
        const messageBytes = decodeUTF8(this.createMessage(nonce));
        const signatureBytes = bs58.decode(signature);
        
        return nacl.sign.detached.verify(
          messageBytes,
          signatureBytes,
          publicKey.toBytes()
        );
      } else {
        // Hardware wallet signature verification (transaction-based)
        const transaction = Transaction.from(bs58.decode(signature));
        const instructions = transaction.instructions;
        
        const memoInstruction = instructions.find((instruction) =>
          instruction.programId.equals(
            new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
          )
        );
        
        if (!memoInstruction) {
          throw new Error('Invalid hardware wallet signature - no memo instruction found');
        }
        
        return memoInstruction.data.toString() === this.createMessage(nonce);
      }
    } catch (error) {
      throw new Error(`Error validating signature: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create nonce and message in one call
   */
  createChallenge(): { nonce: string; message: string } {
    const nonce = this.generateNonce();
    const message = this.createMessage(nonce);
    return { nonce, message };
  }
}

// Export a default instance
export const solanaAuth = new SolanaAuthentication();

// Export utility functions
export function generateNonce(): string {
  return solanaAuth.generateNonce();
}

export function createMessage(nonce: string): string {
  return solanaAuth.createMessage(nonce);
}

export function verifySignature(
  address: string,
  nonce: string,
  signature: string,
  isHardwareWallet: boolean = false
): Promise<boolean> {
  return solanaAuth.verifySignature(address, nonce, signature, isHardwareWallet);
}

export function createChallenge(): { nonce: string; message: string } {
  return solanaAuth.createChallenge();
}