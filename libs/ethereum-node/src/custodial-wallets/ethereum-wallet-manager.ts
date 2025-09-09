import { Wallet, isAddress, JsonRpcProvider, Contract, parseEther, formatEther, formatUnits, parseUnits } from 'ethers';
import { eq } from 'drizzle-orm';
import { 
  WalletManager, 
  WalletManagerConfig, 
  CustodialWallet,
  custodialWalletsSchema,
  deriveKeyFromObject,
  type KeyDerivableObject
} from '@libs/crypto-utils';

export interface EthereumWalletManagerConfig extends WalletManagerConfig {
  database: any; // drizzle database instance
  rpcProvider: JsonRpcProvider;
}

export class EthereumWalletManager extends WalletManager {
  private db: any;
  private provider: JsonRpcProvider;

  constructor(config: EthereumWalletManagerConfig) {
    super(config);
    this.db = config.database;
    this.provider = config.rpcProvider;
  }

  async generateWallet(): Promise<{ address: string; privateKey: string }> {
    const wallet = Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey
    };
  }

  validateAddress(address: string): boolean {
    return isAddress(address);
  }

  async getWalletByIdentifier(identifier: string): Promise<CustodialWallet | null> {
    const result = await this.db
      .select()
      .from(custodialWalletsSchema)
      .where(eq(custodialWalletsSchema  .keyIdentifier, identifier))
      .limit(1);
    
    return result[0] || null;
  }

  async createWallet(
    identifier: string, 
    address: string, 
    encryptedPrivateKey: string, 
    iv: string
  ): Promise<CustodialWallet> {
    const [wallet] = await this.db
      .insert(custodialWalletsSchema)
      .values({
        keyIdentifier: identifier,
        address,
        encryptedPrivateKey,
        iv,
        chainType: 'ethereum'
      })
      .returning();
    
    return wallet;
  }

  async updateWallet(id: string, updates: Partial<CustodialWallet>): Promise<CustodialWallet> {
    const [wallet] = await this.db
      .update(custodialWalletsSchema)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(custodialWalletsSchema.id, parseInt(id)))
      .returning();
    
    return wallet;
  }


  async getOrCreateWalletForObject(obj: KeyDerivableObject): Promise<CustodialWallet> {
    const identifier = deriveKeyFromObject(obj);
    return this.getOrCreateWallet(identifier);
  }

  async getEthersWallet(wallet: CustodialWallet): Promise<Wallet> {
    const privateKey = await this.getDecryptedPrivateKey(wallet);
    return new Wallet(privateKey, this.provider);
  }

  async getBalance(wallet: CustodialWallet): Promise<string> {
    const balance = await this.provider.getBalance(wallet.address);
    return formatEther(balance);
  }

  async getERC20Balance(wallet: CustodialWallet, tokenAddress: string): Promise<string> {
    const erc20Abi = [
      'function balanceOf(address owner) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ];
    
    const contract = new Contract(tokenAddress, erc20Abi, this.provider);
    const [balance, decimals] = await Promise.all([
      contract.balanceOf(wallet.address),
      contract.decimals()
    ]);
    
    return formatUnits(balance, decimals);
  }

  async withdrawETH(wallet: CustodialWallet, toAddress: string, amount: string): Promise<string> {
    const ethersWallet = await this.getEthersWallet(wallet);
    
    const tx = await ethersWallet.sendTransaction({
      to: toAddress,
      value: parseEther(amount)
    });
    
    return tx.hash;
  }

  async withdrawERC20(
    wallet: CustodialWallet, 
    tokenAddress: string, 
    toAddress: string, 
    amount: string
  ): Promise<string> {
    const ethersWallet = await this.getEthersWallet(wallet);
    
    const erc20Abi = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function decimals() view returns (uint8)'
    ];
    
    const contract = new Contract(tokenAddress, erc20Abi, ethersWallet);
    const decimals = await contract.decimals();
    const parsedAmount = parseUnits(amount, decimals);
    
    const tx = await contract.transfer(toAddress, parsedAmount);
    return tx.hash;
  }
}