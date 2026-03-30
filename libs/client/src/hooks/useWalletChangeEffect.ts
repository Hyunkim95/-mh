import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

/**
 * Custom hook to handle wallet change detection and data refresh
 * Automatically invalidates wallet-dependent queries when wallet changes
 */
export const useWalletChangeEffect = (options?: {
  onWalletChange?: (oldWallet: string | null, newWallet: string | null) => void;
  showToast?: boolean;
  invalidateQueries?: boolean;
}) => {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const previousWalletRef = useRef<string | null>(null);
  
  const {
    onWalletChange,
    showToast = true,
    invalidateQueries = true
  } = options || {};

  useEffect(() => {
    const currentWallet = publicKey?.toBase58() || null;
    const previousWallet = previousWalletRef.current;

    // If wallet changed (and it's not the initial load)
    if (previousWallet !== null && previousWallet !== currentWallet) {
      // Call custom callback if provided
      if (onWalletChange) {
        onWalletChange(previousWallet, currentWallet);
      }
      
      // Invalidate wallet-dependent queries
      if (invalidateQueries) {
        queryClient.invalidateQueries({
          predicate: (query) => {
            // Invalidate queries that contain creator parameter
            const queryKey = query.queryKey;
            if (Array.isArray(queryKey) && queryKey.length > 1) {
              const params = queryKey[1];
              return params && typeof params === 'object' && 'creator' in params;
            }
            return false;
          }
        });
      }
      
      // Show notification about data refresh
      if (showToast) {
        if (currentWallet) {
          toast.success('Wallet changed - refreshing data for new wallet');
        } else {
          toast.error('Wallet disconnected');
        }
      }
    }
    
    // Update the ref for next comparison
    previousWalletRef.current = currentWallet;
  }, [publicKey, queryClient, onWalletChange, showToast, invalidateQueries]);

  return {
    currentWallet: publicKey?.toBase58() || null,
    previousWallet: previousWalletRef.current
  };
};
