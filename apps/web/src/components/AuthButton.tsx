import { WalletMultiButton } from '@libs/solana-client';
import { useAuth } from '../hooks/useAuth';
import { useSolanaAuth } from '../hooks/useSolanaAuth';
import { useWalletConnection } from '../hooks/useWalletConnection';

interface AuthButtonProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  className?: string;
}

export function AuthButton({ onSuccess, onError, className = "" }: AuthButtonProps) {
  const { state, logout } = useAuth();
  const { isConnected } = useWalletConnection();
  
  const { authenticate, isLoading, error } = useSolanaAuth({
    onSuccess,
    onError,
  });

  // If user is authenticated, show logout button
  if (state.isAuthenticated && state.user) {
    return (
      <div className={`flex items-center space-x-4 ${className}`}>
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {state.user.publicKey 
              ? `${state.user.publicKey.slice(0, 4)}...${state.user.publicKey.slice(-4)}`
              : 'Connected'
            }
          </span>
          <span className="text-xs text-gray-500 capitalize">
            {state.user.role}
          </span>
        </div>
        <button
          onClick={logout}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          disabled={state.isLoading}
        >
          {state.isLoading ? 'Logging out...' : 'Logout'}
        </button>
      </div>
    );
  }

  // If wallet is connected but not authenticated, show authenticate button
  if (isConnected) {
    return (
      <div className={`flex flex-col space-y-2 ${className}`}>
        <button
          onClick={authenticate}
          disabled={isLoading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Authenticating...' : 'Sign Message to Login'}
        </button>
        {error && (
          <p className="text-red-600 text-sm">{error}</p>
        )}
      </div>
    );
  }

  // If wallet is not connected, show wallet connection button
  return (
    <div className={className}>
      <WalletMultiButton />
    </div>
  );
}

// Simple authentication status component
export function AuthStatus() {
  const { state } = useAuth();
  const { isConnected } = useWalletConnection();

  if (state.isLoading) {
    return <div className="animate-pulse">Checking authentication...</div>;
  }

  if (state.isAuthenticated && state.user) {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
        <span className="text-green-700 font-medium">
          Authenticated as {state.user.role}
        </span>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
        <span className="text-yellow-700 font-medium">
          Wallet connected - Sign message to authenticate
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
      <span className="text-gray-700">
        Not connected
      </span>
    </div>
  );
}