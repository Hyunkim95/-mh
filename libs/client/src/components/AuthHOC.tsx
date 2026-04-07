import { useSolanaAuth } from "../hooks/useSolanaAuth";
import { Login } from "../pages/Login";
import { useWallet } from "@solana/wallet-adapter-react";
import { getStoredAuthToken } from "../utils/authToken";

export const AuthHOC = ({ children }: { children: React.ReactNode }) => {
  const { userData, isLoading } = useSolanaAuth();
  const { publicKey, connecting, wallet } = useWallet();

  const hasStoredToken = !!getStoredAuthToken();
  const isWaitingForWalletSession =
    hasStoredToken && (!!connecting || (!!wallet && !publicKey));

  if ((hasStoredToken && isLoading) || isWaitingForWalletSession) {
    return null;
  }

  if (!userData || !publicKey || userData.publicKey !== publicKey.toString()) {
    return <Login />;
  }
  return children;
};
