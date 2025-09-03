import type { CustodialWallet } from './schema';
import { encryptPrivateKey, decryptPrivateKey } from './encryption';

export interface WalletManagerConfig {
  encryptionKey: string;
}

export abstract class WalletManager {
  protected config: WalletManagerConfig;

  constructor(config: WalletManagerConfig) {
    this.config = config;
  }

  abstract generateWallet(): Promise<{ address: string; privateKey: string }>;
  abstract validateAddress(address: string): boolean;
  abstract getWalletByIdentifier(identifier: string): Promise<CustodialWallet | null>;
  abstract createWallet(identifier: string, address: string, encryptedPrivateKey: string, iv: string): Promise<CustodialWallet>;
  abstract updateWallet(id: string, updates: Partial<CustodialWallet>): Promise<CustodialWallet>;

  async getOrCreateWallet(identifier: string): Promise<CustodialWallet> {
    let wallet = await this.getWalletByIdentifier(identifier);
    
    if (!wallet) {
      const { address, privateKey } = await this.generateWallet();
      const { encrypted, iv } = encryptPrivateKey(privateKey, this.config.encryptionKey);
      
      wallet = await this.createWallet(identifier, address, encrypted, iv);
    }
    
    return wallet;
  }

  async getDecryptedPrivateKey(wallet: CustodialWallet): Promise<string> {
    return decryptPrivateKey(
      { encrypted: wallet.encryptedPrivateKey, iv: wallet.iv },
      this.config.encryptionKey
    );
  }
}