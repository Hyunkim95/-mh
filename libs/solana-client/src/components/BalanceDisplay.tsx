import { PublicKey } from '@solana/web3.js';
import { useBalance } from '../hooks/useBalance';

interface BalanceDisplayProps {
  publicKey: PublicKey | null;
  label?: string;
  decimals?: number;
}

/**
 * Component to display SOL balance for a wallet
 */
export function BalanceDisplay({ 
  publicKey, 
  label = 'Balance', 
  decimals = 4 
}: BalanceDisplayProps) {
  const { balance, loading, error } = useBalance(publicKey);

  if (!publicKey) {
    return <div>{label}: Not connected</div>;
  }

  if (loading) {
    return <div>{label}: Loading...</div>;
  }

  if (error) {
    return <div>{label}: Error loading balance</div>;
  }

  return (
    <div>
      {label}: {balance?.toFixed(decimals) || '0'} SOL
    </div>
  );
}
