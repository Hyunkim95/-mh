import { 
  Keypair, 
  PublicKey, 
  Connection, 
  Transaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import { 
  getAccount, 
  getAssociatedTokenAddress, 
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  getMint
} from '@solana/spl-token';
import { eq } from 'drizzle-orm';
import bs58 from 'bs58';
import { 
  WalletManager, 
  WalletManagerConfig, 
  CustodialWallet,
  custodialWallets,
  deriveKeyFromObject,
  type KeyDerivableObject
} from '@libs/crypto-utils';

export interface SolanaWalletManagerConfig extends WalletManagerConfig {
  database: any; // drizzle database instance
  connection: Connection;
}

export class SolanaWalletManager extends WalletManager {
  private db: any;
  private connection: Connection;

  constructor(config: SolanaWalletManagerConfig) {
    super(config);
    this.db = config.database;
    this.connection = config.connection;
  }

  async generateWallet(): Promise<{ address: string; privateKey: string }> {
    const keypair = Keypair.generate();
    return {
      address: keypair.publicKey.toBase58(),
      privateKey: bs58.encode(keypair.secretKey)
    };
  }

  validateAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  async getWalletByIdentifier(identifier: string): Promise<CustodialWallet | null> {
    const result = await this.db
      .select()
      .from(custodialWallets)
      .where(eq(custodialWallets.keyIdentifier, identifier))
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
      .insert(custodialWallets)
      .values({
        keyIdentifier: identifier,
        address,
        encryptedPrivateKey,
        iv,
        chainType: 'solana'
      })
      .returning();
    
    return wallet;
  }

  async updateWallet(id: string, updates: Partial<CustodialWallet>): Promise<CustodialWallet> {
    const [wallet] = await this.db
      .update(custodialWallets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(custodialWallets.id, parseInt(id)))
      .returning();
    
    return wallet;
  }

  async getOrCreateWalletForObject(obj: KeyDerivableObject): Promise<CustodialWallet> {
    const identifier = deriveKeyFromObject(obj);
    return this.getOrCreateWallet(identifier);
  }

  async getKeypairFromWallet(wallet: CustodialWallet): Promise<Keypair> {
    const privateKeyString = await this.getDecryptedPrivateKey(wallet);
    const privateKeyBytes = bs58.decode(privateKeyString);
    return Keypair.fromSecretKey(privateKeyBytes);
  }

  async getBalance(wallet: CustodialWallet): Promise<string> {
    const publicKey = new PublicKey(wallet.address);
    const balance = await this.connection.getBalance(publicKey);
    return (balance / LAMPORTS_PER_SOL).toString();
  }

  async getSPLTokenBalance(wallet: CustodialWallet, mintAddress: string): Promise<string> {
    const walletPublicKey = new PublicKey(wallet.address);
    const mintPublicKey = new PublicKey(mintAddress);
    
    try {
      const associatedTokenAddress = await getAssociatedTokenAddress(
        mintPublicKey,
        walletPublicKey
      );
      
      const account = await getAccount(this.connection, associatedTokenAddress);
      const mintInfo = await getMint(this.connection, mintPublicKey);
      
      return (Number(account.amount) / Math.pow(10, mintInfo.decimals)).toString();
    } catch (error) {
      return '0';
    }
  }

  async withdrawSOL(wallet: CustodialWallet, toAddress: string, amount: string): Promise<string> {
    const keypair = await this.getKeypairFromWallet(wallet);
    const toPublicKey = new PublicKey(toAddress);
    const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: toPublicKey,
        lamports
      })
    );
    
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [keypair]
    );
    
    return signature;
  }

  async withdrawSPLToken(
    wallet: CustodialWallet,
    mintAddress: string,
    toAddress: string,
    amount: string
  ): Promise<string> {
    const keypair = await this.getKeypairFromWallet(wallet);
    const mintPublicKey = new PublicKey(mintAddress);
    const toPublicKey = new PublicKey(toAddress);
    
    const fromTokenAccount = await getAssociatedTokenAddress(
      mintPublicKey,
      keypair.publicKey
    );
    
    const toTokenAccount = await getAssociatedTokenAddress(
      mintPublicKey,
      toPublicKey
    );
    
    const mintInfo = await getMint(this.connection, mintPublicKey);
    const tokenAmount = Math.floor(parseFloat(amount) * Math.pow(10, mintInfo.decimals));
    
    const transaction = new Transaction().add(
      createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        keypair.publicKey,
        BigInt(tokenAmount),
        [],
        TOKEN_PROGRAM_ID
      )
    );
    
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [keypair]
    );
    
    return signature;
  }
}