import { useQueryClient } from '@tanstack/react-query';
import { useAtom, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { trpc } from '../lib/trpc';
import { 
  loginAtom, 
  logoutAtom, 
  setLoadingAtom, 
  setErrorAtom,
  clearErrorAtom,
  accessTokenAtom,
  userAtom,
  isAuthenticatedAtom
} from '../store/auth.atoms';

// Challenge mutation using tRPC
export const useChallengeMutation = () => {
  const setError = useSetAtom(setErrorAtom);
  
  return trpc.auth.challenge.useMutation({
    onError: (error) => {
      setError(error.message);
    },
  });
};

// Verify mutation using tRPC
export const useVerifyMutation = () => {
  const setError = useSetAtom(setErrorAtom);
  const login = useSetAtom(loginAtom);
  
  return trpc.auth.verify.useMutation({
    onSuccess: (response) => {
      if (response.data) {
        const { user, token } = response.data;
        login({
          user,
          tokens: { accessToken: token }
        });
      }
    },
    onError: (error) => {
      setError(error.message);
    },
  });
};

// Me query using tRPC
export const useMeQuery = () => {
  const [accessToken] = useAtom(accessTokenAtom);
  const setError = useSetAtom(setErrorAtom);
  
  return trpc.auth.me.useQuery(undefined, {
    enabled: !!accessToken,
    retry: (failureCount, error: any) => {
      // Don't retry on auth errors
      if (error?.data?.code === 'UNAUTHORIZED') {
        return false;
      }
      return failureCount < 2;
    },
    onError: (error) => {
      setError(error.message);
    },
  });
};

// Logout mutation using tRPC
export const useLogoutMutation = () => {
  const queryClient = useQueryClient();
  const logout = useSetAtom(logoutAtom);
  const setError = useSetAtom(setErrorAtom);
  
  return trpc.auth.logout.useMutation({
    onSuccess: () => {
      logout();
      queryClient.clear();
    },
    onError: (error) => {
      // Always logout locally even if server request fails
      logout();
      queryClient.clear();
      setError(error.message);
    },
  });
};

// Health check query using tRPC
export const useHealthQuery = () => {
  return trpc.auth.health.useQuery();
};

// Auth initialization hook
export const useAuthInit = () => {
  const [accessToken] = useAtom(accessTokenAtom);
  const [user] = useAtom(userAtom);
  const [isAuthenticated] = useAtom(isAuthenticatedAtom);
  const setLoading = useSetAtom(setLoadingAtom);
  const login = useSetAtom(loginAtom);
  const logout = useSetAtom(logoutAtom);
  const clearError = useSetAtom(clearErrorAtom);
  
  const meQuery = useMeQuery();
  
  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      clearError();
      
      // If no token, clear everything and exit
      if (!accessToken) {
        logout();
        return;
      }
      
      // If we have both token and user data, we're already authenticated
      // Only validate with server if we're missing user data or want to refresh
      if (accessToken && user && isAuthenticated) {
        console.log('Auth: Restored from localStorage', { 
          user: user.publicKey.slice(0, 8) + '...', 
          role: user.role 
        });
        return;
      }
      
      // We have token but no user data, or need to validate - fetch from server
      setLoading(true);
      
      try {
        const result = await meQuery.refetch();
        
        if (result.data?.data) {
          const { user: serverUser } = result.data.data;
          login({
            user: serverUser,
            tokens: { accessToken }
          });
          console.log('Auth: Validated with server', { 
            user: serverUser.publicKey.slice(0, 8) + '...', 
            role: serverUser.role 
          });
        } else {
          logout();
        }
      } catch (error) {
        console.error('Auth: Server validation failed, logging out', error);
        logout();
      } finally {
        setLoading(false);
      }
    };
    
    initAuth();
  }, [accessToken, user, isAuthenticated, meQuery, login, logout, setLoading, clearError]);
  
  return {
    isInitializing: meQuery.isLoading,
    error: meQuery.error,
  };
};
