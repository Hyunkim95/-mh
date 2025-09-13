import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Types
export interface User {
  id: number;
  publicKey: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  error: string | null;
}

// Persistent atoms (stored in localStorage)
export const authTokensAtom = atomWithStorage<AuthTokens | null>('auth_tokens', null);
export const userAtom = atomWithStorage<User | null>('auth_user', null);

// Session atoms (in-memory, derived from persistent data)
export const isAuthenticatedAtom = atom<boolean>((get) => {
  const tokens = get(authTokensAtom);
  const user = get(userAtom);
  return !!(tokens?.accessToken && user);
});
export const isLoadingAtom = atom<boolean>(false);
export const authErrorAtom = atom<string | null>(null);

// Derived atom for complete auth state
export const authStateAtom = atom<AuthState>((get) => ({
  isAuthenticated: get(isAuthenticatedAtom),
  isLoading: get(isLoadingAtom),
  user: get(userAtom),
  error: get(authErrorAtom),
}));

// Action atoms
export const loginAtom = atom(null, (_get, set, { user, tokens }: { user: User; tokens: AuthTokens }) => {
  set(userAtom, user);
  set(authTokensAtom, tokens);
  set(isLoadingAtom, false);
  set(authErrorAtom, null);
});

export const logoutAtom = atom(null, (_get, set) => {
  set(userAtom, null);
  set(authTokensAtom, null);
  set(isLoadingAtom, false);
  set(authErrorAtom, null);
});

export const setLoadingAtom = atom(null, (_get, set, loading: boolean) => {
  set(isLoadingAtom, loading);
});

export const setErrorAtom = atom(null, (_get, set, error: string | null) => {
  set(authErrorAtom, error);
});

export const clearErrorAtom = atom(null, (_get, set) => {
  set(authErrorAtom, null);
});

// Utility atoms
export const accessTokenAtom = atom<string | null>((get) => {
  const tokens = get(authTokensAtom);
  return tokens?.accessToken || null;
});

export const hasRoleAtom = atom((get) => (role: 'user' | 'admin') => {
  const user = get(userAtom);
  const isAuthenticated = get(isAuthenticatedAtom);
  return isAuthenticated && user?.role === role;
});

export const isAdminAtom = atom((get) => {
  const hasRole = get(hasRoleAtom);
  return hasRole('admin');
});

export const isUserAtom = atom((get) => {
  const hasRole = get(hasRoleAtom);
  return hasRole('user');
});

export const isUserOrAdminAtom = atom((get) => {
  const user = get(userAtom);
  const isAuthenticated = get(isAuthenticatedAtom);
  return isAuthenticated && (user?.role === 'user' || user?.role === 'admin');
});
