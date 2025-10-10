import { useSolanaAuth } from "../hooks/useSolanaAuth";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  WalletDisconnectButton,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import { useEffect } from "react";
import { router } from "../router";

export const Login = () => {
  const { authenticate, userData } = useSolanaAuth();
  const { publicKey } = useWallet();

  useEffect(() => {
    if (userData && publicKey) {
      router.navigate({ to: "/multihopper" });
    }
  }, [userData]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Login</h1>
            <p className="text-sm text-gray-600">
              Connect your Solana wallet to continue
            </p>
          </div>

          <div className="space-y-6">
            {publicKey ? (
              <button
                onClick={() => authenticate()}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out"
              >
                Login
              </button>
            ) : (
              <div className="flex justify-center">
                <WalletMultiButton />
              </div>
            )}

            {publicKey && (
              <div className="text-center">
                <WalletDisconnectButton />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
