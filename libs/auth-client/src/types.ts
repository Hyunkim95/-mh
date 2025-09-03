import { BaseUser, AuthResult, AuthError } from '@trpc-template/auth-shared'

export interface AuthState<TUser = BaseUser, TTokens = any> {
  isAuthenticated: boolean
  isLoading: boolean
  user: TUser | null
  tokens: TTokens | null
  error: AuthError | null
}

export interface AuthClientConfig {
  apiUrl: string
  tokenStorage: 'localStorage' | 'sessionStorage' | 'memory' | TokenStorage
  autoRefresh: boolean
  refreshThreshold?: number // minutes before expiry to refresh
}

export interface TokenStorage {
  getTokens(): Promise<any> | any
  setTokens(tokens: any): Promise<void> | void
  clearTokens(): Promise<void> | void
}

export interface AuthApiClient<TUser = BaseUser, TTokens = any> {
  login(method: string, credentials: any): Promise<AuthResult<TUser> & { tokens?: TTokens }>
  refresh(refreshToken: string): Promise<TTokens>
  logout(token: string): Promise<void>
  verifyToken(token: string): Promise<{ user: TUser } | null>
}