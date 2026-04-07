import { useEffect } from "react";
import { useSolanaAuth } from "../hooks/useSolanaAuth";
import { Login } from "../pages/Login";
import { useWallet } from "@solana/wallet-adapter-react";
import { getStoredAuthToken } from "../utils/authToken";
import { isBetaGateEnabled } from "./BetaAccessGate";
import { router } from "../router";

export const AuthHOC = ({ children }: { children: React.ReactNode }) => {
  const { userData, isLoading } = useSolanaAuth();
  const { publicKey, connecting, wallet } = useWallet();

  const betaGateEnabled = isBetaGateEnabled();

  // When the beta gate is enabled, only the landing page is accessible.
  useEffect(() => {
    if (betaGateEnabled) {
      router.navigate({ to: "/" });
    }
  }, [betaGateEnabled]);

  if (betaGateEnabled) {
    return null;
  }

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
