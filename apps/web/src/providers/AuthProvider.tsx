import { ReactNode } from 'react';
import { Provider as JotaiProvider } from 'jotai';
import { useAuthInit } from '../hooks/useAuthQueries';

interface AuthProviderProps {
  children: ReactNode;
}

function AuthInitializer({ children }: { children: ReactNode }) {
  useAuthInit();
  return <>{children}</>;
}

export function AuthProvider({ children }: AuthProviderProps) {
  return (
    <JotaiProvider>
      <AuthInitializer>
        {children}
      </AuthInitializer>
    </JotaiProvider>
  );
}
