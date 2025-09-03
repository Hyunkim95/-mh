import React from 'react';
import { useEthereumWallet } from '../hooks/useEthereumWallet';

export interface ConnectButtonProps {
  className?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  connectText?: string;
  disconnectText?: string;
  showAddress?: boolean;
  showChain?: boolean;
}

export const ConnectButton: React.FC<ConnectButtonProps> = ({
  className = '',
  children,
  style,
  connectText = 'Connect Wallet',
  disconnectText = 'Disconnect',
  showAddress = true,
  showChain = false,
}) => {
  const {
    isConnected,
    isConnecting,
    shortAddress,
    chainName,
    connect,
    disconnect,
  } = useEthereumWallet();

  if (children) {
    return (
      <button
        className={className}
        style={style}
        onClick={isConnected ? disconnect : connect}
        disabled={isConnecting}
      >
        {children}
      </button>
    );
  }

  if (isConnected) {
    return (
      <button
        className={className}
        style={style}
        onClick={disconnect}
        title={disconnectText}
      >
        {showAddress && shortAddress}
        {showAddress && showChain && ' • '}
        {showChain && chainName}
      </button>
    );
  }

  return (
    <button
      className={className}
      style={style}
      onClick={connect}
      disabled={isConnecting}
    >
      {isConnecting ? 'Connecting...' : connectText}
    </button>
  );
};