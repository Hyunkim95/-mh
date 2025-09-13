import { useCallback, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { 
  PublicKey, 
  SystemProgram, 
  Transaction, 
  TransactionInstruction 
} from '@solana/web3.js';
import bs58 from 'bs58';
import { defaultAuthAPI, SolanaAuthAPI } from '../utils/authApi';
import { SolanaConnectRequest } from '../types/auth';

export interface UseSolanaAuthConfig {
  authAPI?: SolanaAuthAPI;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  referralCode?: string;
}

export interface UseSolanaAuthReturn {
  authenticate: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

export function useSolanaAuth(config: UseSolanaAuthConfig = {}): UseSolanaAuthReturn {
  const { 
    authAPI = defaultAuthAPI,
    onSuccess,
    onError,
    referralCode
  } = config;

  const {
    publicKey,
    signMessage,
    signTransaction,
    wallet: currentWallet,
    disconnect: disconnectWallet
  } = useWallet();
  
  const { connection } = useConnection();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const detectHardwareWallet = useCallback((): boolean => {
    if (!currentWallet) return false;
    
    // Common hardware wallet identifiers
    const hardwareWalletNames = [
      'Ledger',
      'Trezor', 
      'Hardware Wallet'
    ];
    
    return hardwareWalletNames.some(name => 
      currentWallet.adapter.name.toLowerCase().includes(name.toLowerCase())
    );
  }, [currentWallet]);

  const signForStandardWallet = useCallback(async (message: string): Promise<string> => {
    if (!signMessage) {
      throw new Error('Wallet does not support message signing');
    }
    
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = await signMessage(messageBytes);
    return bs58.encode(signatureBytes);
  }, [signMessage]);

  const signForHardwareWallet = useCallback(async (message: string): Promise<string> => {
    if (!signTransaction || !publicKey) {
      throw new Error('Hardware wallet signing not available');
    }

    const transaction = new Transaction();
    const recentBlockhash = await connection.getLatestBlockhash();
    transaction.recentBlockhash = recentBlockhash.blockhash;
    transaction.feePayer = publicKey;

    // Add a dummy transfer instruction
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: publicKey,
        lamports: BigInt(0),
      })
    );

    // Add memo instruction with the message
    transaction.add(
      new TransactionInstruction({
        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        keys: [],
        data: Buffer.from(message, 'utf8'),
      })
    );

    const signedTransaction = await signTransaction(transaction);
    return bs58.encode(signedTransaction.serialize());
  }, [signTransaction, publicKey, connection]);

  const authenticate = useCallback(async () => {
    if (!publicKey) {
      const error = new Error('Please connect your wallet first');
      setError(error);
      onError?.(error);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get nonce and message from backend
      const { message } = await authAPI.initiateSolanaConnect();
      
      const isHardwareWallet = detectHardwareWallet();
      
      // Sign the message
      const signature = isHardwareWallet
        ? await signForHardwareWallet(message)
        : await signForStandardWallet(message);

      // Send the signature to backend for verification
      const request: SolanaConnectRequest = {
        solanaAddress: publicKey.toString(),
        signature,
        referralCode,
        isHardwareWallet,
      };

      await authAPI.solanaConnect(request);
      
      onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Authentication failed');
      setError(error);
      onError?.(error);
      disconnectWallet();
    } finally {
      setIsLoading(false);
    }
  }, [
    publicKey,
    authAPI,
    detectHardwareWallet,
    signForHardwareWallet,
    signForStandardWallet,
    referralCode,
    onSuccess,
    onError,
    disconnectWallet
  ]);

  return {
    authenticate,
    isLoading,
    error
  };
}