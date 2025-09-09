import { useCallback, useState, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { 
  PublicKey, 
  SystemProgram, 
  Transaction, 
  TransactionInstruction 
} from '@solana/web3.js';
import bs58 from 'bs58';
import { useSetAtom } from 'jotai';
import { setLoadingAtom, setErrorAtom, clearErrorAtom } from '../store/auth.atoms';
import { useChallengeMutation, useVerifyMutation } from './useAuthQueries';

export interface UseSolanaAuthConfig {
  onSuccess?: (user: any) => void;
  onError?: (error: Error) => void;
  referralCode?: string;
}

export interface UseSolanaAuthReturn {
  authenticate: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  publicKey: PublicKey | null;
  disconnect: () => Promise<void>;
}

export function useSolanaAuth(config: UseSolanaAuthConfig = {}): UseSolanaAuthReturn {
  const { 
    onSuccess,
    onError,
    referralCode
  } = config;

  const {
    publicKey,
    signMessage,
    signTransaction,
    wallet: currentWallet,
    disconnect: disconnectWallet,
    connected
  } = useWallet();
  
  const { connection } = useConnection();
  
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  
  // Jotai setters
  const setGlobalLoading = useSetAtom(setLoadingAtom);
  const setGlobalError = useSetAtom(setErrorAtom);
  const clearGlobalError = useSetAtom(clearErrorAtom);
  
  // tRPC mutations
  const challengeMutation = useChallengeMutation();
  const verifyMutation = useVerifyMutation();
  
  const abortControllerRef = useRef<AbortController | null>(null);

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
      setLocalError(error.message);
      setGlobalError(error.message);
      onError?.(error);
      return;
    }

    // Abort any pending authentication
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    setLocalLoading(true);
    setGlobalLoading(true);
    setLocalError(null);
    clearGlobalError();

    try {
      // Step 1: Get challenge from backend using tRPC
      const challengeResponse = await challengeMutation.mutateAsync({
        publicKey: publicKey.toString()
      });
      
      if (!challengeResponse.data) {
        throw new Error('Invalid challenge response');
      }
      
      const { nonce, message } = challengeResponse.data;
      const isHardwareWallet = detectHardwareWallet();
      
      // Step 2: Sign the challenge message
      const signature = isHardwareWallet
        ? await signForHardwareWallet(message)
        : await signForStandardWallet(message);

      // Step 3: Verify signature with backend using tRPC
      const verifyResponse = await verifyMutation.mutateAsync({
        publicKey: publicKey.toString(),
        signature,
        nonce,
        isHardwareWallet
      });
      
      // Success callback
      if (verifyResponse.data?.user) {
        onSuccess?.(verifyResponse.data.user);
      }
    } catch (err: any) {
      // Check if error was due to abort
      if (err.name === 'AbortError') {
        return;
      }
      
      const error = err instanceof Error ? err : new Error('Authentication failed');
      setLocalError(error.message);
      setGlobalError(error.message);
      onError?.(error);
      
      // Disconnect wallet on auth failure
      await disconnectWallet();
    } finally {
      setLocalLoading(false);
      setGlobalLoading(false);
      abortControllerRef.current = null;
    }
  }, [
    publicKey,
    challengeMutation,
    verifyMutation,
    detectHardwareWallet,
    signForHardwareWallet,
    signForStandardWallet,
    referralCode,
    onSuccess,
    onError,
    disconnectWallet,
    setGlobalLoading,
    setGlobalError,
    clearGlobalError
  ]);

  const disconnect = useCallback(async () => {
    // Abort any pending authentication
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Disconnect wallet
    await disconnectWallet();
    
    setLocalError(null);
    setLocalLoading(false);
    clearGlobalError();
  }, [disconnectWallet, clearGlobalError]);

  return {
    authenticate,
    isLoading: localLoading || challengeMutation.isPending || verifyMutation.isPending,
    error: localError || challengeMutation.error?.message || verifyMutation.error?.message || null,
    isConnected: connected,
    publicKey,
    disconnect
  };
}
