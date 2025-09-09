import { useAtomValue, useSetAtom } from 'jotai';
import { 
  authStateAtom,
  userAtom,
  isAuthenticatedAtom,
  isLoadingAtom,
  authErrorAtom,
  clearErrorAtom,
  isAdminAtom,
  isUserAtom,
  isUserOrAdminAtom,
  hasRoleAtom,
  accessTokenAtom
} from '../store/auth.atoms';
import { useLogoutMutation } from './useAuthQueries';

export function useAuth() {
  const state = useAtomValue(authStateAtom);
  const clearError = useSetAtom(clearErrorAtom);
  const logoutMutation = useLogoutMutation();
  
  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error) {
      // Logout handled in mutation onError
      console.error('Logout error:', error);
    }
  };
  
  return {
    state,
    logout: handleLogout,
    clearError,
    isLoggingOut: logoutMutation.isPending,
  };
}

export function useUser() {
  return useAtomValue(userAtom);
}

export function useAuthStatus() {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const isLoading = useAtomValue(isLoadingAtom);
  const error = useAtomValue(authErrorAtom);
  
  return {
    isAuthenticated,
    isLoading,
    error,
  };
}

export function usePermissions() {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const user = useAtomValue(userAtom);
  const hasRole = useAtomValue(hasRoleAtom);
  const isAdmin = useAtomValue(isAdminAtom);
  const isUser = useAtomValue(isUserAtom);
  const isUserOrAdmin = useAtomValue(isUserOrAdminAtom);
  
  return {
    isAuthenticated,
    user,
    hasRole,
    isAdmin: () => isAdmin,
    isUser: () => isUser,
    isUserOrAdmin: () => isUserOrAdmin,
  };
}

export function useAccessToken() {
  return useAtomValue(accessTokenAtom);
}

// Legacy compatibility hooks
export function useIsAuthenticated(): boolean {
  return useAtomValue(isAuthenticatedAtom);
}

export function useAuthLoading(): boolean {
  return useAtomValue(isLoadingAtom);
}

export function useAuthError() {
  return useAtomValue(authErrorAtom);
}