import { useSolanaAuth } from "../hooks/useSolanaAuth";
import { Login } from "../pages/Login";
import { useWallet } from "@solana/wallet-adapter-react";

export const AuthHOC = ({ children }: { children: React.ReactNode }) => {
  const { userData } = useSolanaAuth();
  const { publicKey } = useWallet();
  if (!userData || !publicKey || userData.publicKey !== publicKey.toString()) {
    return <Login />;
  }
  return children;
};
