import { useSolanaAuth } from "../hooks/useSolanaAuth";
import { Login } from "../pages/Login";

export const AuthHOC = ({ children }: { children: React.ReactNode }) => {
  const { userData } = useSolanaAuth();
  if (!userData) {
    return <Login />;
  }
  return children;
};
