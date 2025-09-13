import { WalletDisconnectButton, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '../hooks/useWallet';

/**
 * Simple wallet connection button component
 */
export function WalletButton() {
  const { isConnected } = useWallet();

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <WalletMultiButton />
      {isConnected && <WalletDisconnectButton />}
    </div>
  );
}
