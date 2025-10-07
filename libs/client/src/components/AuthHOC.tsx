import { useSolanaAuth } from "../hooks/useSolanaAuth";
import { Login } from "../pages/Login";

export const AuthHOC = ({ children }: { children: React.ReactNode }) => {
  const { userData, isFetched, isLoading } = useSolanaAuth();
  if (!userData && isFetched && !isLoading) {
    return <Login />;
  }
  return children;
};
