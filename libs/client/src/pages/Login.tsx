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
    if (userData) {
      router.navigate({ to: "/multihopper" });
    }
  }, [userData]);

  return (
    <div>
      <h1>Login</h1>
      {publicKey ? (
        <button onClick={() => authenticate()}>Login</button>
      ) : (
        <WalletMultiButton />
      )}
      <WalletDisconnectButton />
    </div>
  );
};
