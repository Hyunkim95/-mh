import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { BaseUser, AuthResult } from '@trpc-template/auth-shared'
import { AuthState, AuthClientConfig } from '../types'
import { AuthClientManager } from '../auth-manager'

export interface AuthContextValue<TUser = BaseUser, TTokens = any> {
  state: AuthState<TUser, TTokens>
  login: <TCredentials>(
    method: string,
    credentials: TCredentials,
    customLoginFn?: (credentials: TCredentials) => Promise<AuthResult<TUser> & { tokens?: TTokens }>
  ) => Promise<AuthResult<TUser>>
  logout: () => Promise<void>
  refreshTokens: () => Promise<boolean>
  getAccessToken: () => string | null
}

const AuthContext = createContext<AuthContextValue<any, any> | null>(null)

export interface AuthProviderProps {
  children: ReactNode
  config: AuthClientConfig
  apiClient?: any
}

export function AuthProvider<TUser = BaseUser, TTokens = any>({
  children,
  config,
  apiClient
}: AuthProviderProps) {
  const [authManager] = useState(() => new AuthClientManager<TUser, TTokens>(config, apiClient))
  const [state, setState] = useState<AuthState<TUser, TTokens>>(authManager.currentState)

  useEffect(() => {
    const unsubscribe = authManager.subscribe(setState)
    return unsubscribe
  }, [authManager])

  const contextValue: AuthContextValue<TUser, TTokens> = {
    state,
    login: authManager.login.bind(authManager),
    logout: authManager.logout.bind(authManager),
    refreshTokens: authManager.refreshTokens.bind(authManager),
    getAccessToken: authManager.getAccessToken.bind(authManager)
  }

  return <AuthContext.Provider value={contextValue as AuthContextValue<any, any>}>{children}</AuthContext.Provider>
}

export function useAuth<TUser = BaseUser, TTokens = any>(): AuthContextValue<TUser, TTokens> {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context as AuthContextValue<TUser, TTokens>
}

// Convenience hooks
export function useUser<TUser = BaseUser>(): TUser | null {
  const { state } = useAuth<TUser>()
  return state.user
}

export function useIsAuthenticated(): boolean {
  const { state } = useAuth()
  return state.isAuthenticated
}

export function useAuthLoading(): boolean {
  const { state } = useAuth()
  return state.isLoading
}

export function useAuthError() {
  const { state } = useAuth()
  return state.error
}

export function useAccessToken(): string | null {
  const { getAccessToken } = useAuth()
  return getAccessToken()
}