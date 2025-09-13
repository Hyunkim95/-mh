import React from 'react';
import { WalletMultiButton as BaseWalletMultiButton } from '@solana/wallet-adapter-react-ui';

/**
 * Re-export of the base WalletMultiButton with custom styling options
 */
export function WalletMultiButton({ 
  className = '', 
  ...props 
}: React.ComponentProps<typeof BaseWalletMultiButton>) {
  return (
    <BaseWalletMultiButton 
      className={`wallet-adapter-button ${className}`}
      {...props}
    />
  );
}
