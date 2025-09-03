import { BaseUser, AuthResult, AuthError } from '@trpc-template/auth-shared'
import { AuthState, AuthClientConfig, TokenStorage, AuthApiClient } from './types'
import { BrowserTokenStorage, MemoryTokenStorage } from './token-storage'

export class AuthClientManager<TUser = BaseUser, TTokens = any> {
  private state: AuthState<TUser, TTokens>
  private listeners: Set<(state: AuthState<TUser, TTokens>) => void> = new Set()
  private tokenStorage: TokenStorage
  private apiClient?: AuthApiClient<TUser, TTokens>
  private refreshTimer?: NodeJS.Timeout

  constructor(
    private config: AuthClientConfig,
    apiClient?: AuthApiClient<TUser, TTokens>
  ) {
    this.state = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
      tokens: null,
      error: null
    }

    this.apiClient = apiClient

    // Set up token storage
    if (typeof config.tokenStorage === 'string') {
      if (config.tokenStorage === 'memory') {
        this.tokenStorage = new MemoryTokenStorage()
      } else {
        this.tokenStorage = new BrowserTokenStorage(config.tokenStorage)
      }
    } else {
      this.tokenStorage = config.tokenStorage
    }

    // Initialize from stored tokens
    this.initialize()
  }

  get currentState(): AuthState<TUser, TTokens> {
    return { ...this.state }
  }

  async login<TCredentials>(
    method: string,
    credentials: TCredentials,
    customLoginFn?: (credentials: TCredentials) => Promise<AuthResult<TUser> & { tokens?: TTokens }>
  ): Promise<AuthResult<TUser>> {
    this.setState({ isLoading: true, error: null })

    try {
      let result: AuthResult<TUser> & { tokens?: TTokens }

      // Use custom login function if provided
      if (customLoginFn) {
        result = await customLoginFn(credentials)
      }
      // Use API client
      else if (this.apiClient) {
        result = await this.apiClient.login(method, credentials)
      }
      // Default fetch implementation
      else {
        const response = await fetch(`${this.config.apiUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, credentials })
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        result = await response.json()
      }

      if (result.success && result.user && result.tokens) {
        await this.setAuthenticatedState(result.user, result.tokens)
        this.setupAutoRefresh(result.tokens)
      } else {
        this.setState({
          isLoading: false,
          error: result.error || { code: 'LOGIN_FAILED', message: 'Login failed' }
        })
      }

      return result
    } catch (error) {
      const authError: AuthError = {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error occurred'
      }

      this.setState({ isLoading: false, error: authError })

      return { success: false, error: authError }
    }
  }

  async logout(): Promise<void> {
    this.setState({ isLoading: true })

    try {
      const tokens = this.state.tokens

      // Call logout endpoint if available
      if (this.apiClient && tokens) {
        try {
          await this.apiClient.logout((tokens as any).accessToken)
        } catch {
          // Ignore logout API errors
        }
      }

      // Clear local state regardless of API call success
      await this.clearAuthenticatedState()
    } catch (error) {
      // Still clear state even if there was an error
      await this.clearAuthenticatedState()
    }
  }

  async refreshTokens(): Promise<boolean> {
    const tokens = this.state.tokens
    const refreshToken = tokens ? (tokens as any).refreshToken : null

    if (!refreshToken) return false

    try {
      let newTokens: TTokens

      if (this.apiClient) {
        newTokens = await this.apiClient.refresh(refreshToken)
      } else {
        const response = await fetch(`${this.config.apiUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        })

        if (!response.ok) return false

        newTokens = await response.json()
      }

      await this.tokenStorage.setTokens(newTokens)
      this.setState({ tokens: newTokens })
      this.setupAutoRefresh(newTokens)

      return true
    } catch {
      await this.clearAuthenticatedState()
      return false
    }
  }

  getAccessToken(): string | null {
    const tokens = this.state.tokens
    return tokens ? (tokens as any).accessToken || null : null
  }

  subscribe(callback: (state: AuthState<TUser, TTokens>) => void): () => void {
    this.listeners.add(callback)
    
    return () => {
      this.listeners.delete(callback)
    }
  }

  private async initialize(): Promise<void> {
    this.setState({ isLoading: true })

    try {
      const tokens = await this.tokenStorage.getTokens()
      
      if (!tokens) {
        this.setState({ isLoading: false })
        return
      }

      // Verify token and get user info
      if (this.apiClient) {
        try {
          const result = await this.apiClient.verifyToken((tokens as any).accessToken)
          if (result?.user) {
            await this.setAuthenticatedState(result.user, tokens)
            this.setupAutoRefresh(tokens)
            return
          }
        } catch {
          // Token invalid, clear storage
          await this.tokenStorage.clearTokens()
        }
      } else {
        // No API client, assume tokens are valid
        this.setState({
          isAuthenticated: true,
          isLoading: false,
          tokens,
          user: null // Will need to be set elsewhere
        })
        this.setupAutoRefresh(tokens)
        return
      }
    } catch {
      // Error during initialization
    }

    this.setState({ isLoading: false })
  }

  private async setAuthenticatedState(user: TUser, tokens: TTokens): Promise<void> {
    await this.tokenStorage.setTokens(tokens)
    this.setState({
      isAuthenticated: true,
      isLoading: false,
      user,
      tokens,
      error: null
    })
  }

  private async clearAuthenticatedState(): Promise<void> {
    await this.tokenStorage.clearTokens()
    this.clearAutoRefresh()
    this.setState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      tokens: null,
      error: null
    })
  }

  private setState(updates: Partial<AuthState<TUser, TTokens>>): void {
    this.state = { ...this.state, ...updates }
    this.listeners.forEach(callback => callback(this.state))
  }

  private setupAutoRefresh(tokens: TTokens): void {
    if (!this.config.autoRefresh) return

    this.clearAutoRefresh()

    try {
      const accessToken = (tokens as any).accessToken
      if (!accessToken) return

      // Parse JWT to get expiry (basic implementation)
      const payload = JSON.parse(atob(accessToken.split('.')[1]))
      if (!payload.exp) return

      const expiryTime = payload.exp * 1000
      const now = Date.now()
      const refreshThreshold = (this.config.refreshThreshold || 5) * 60 * 1000 // 5 minutes default
      const refreshTime = expiryTime - refreshThreshold

      if (refreshTime <= now) {
        // Token expires soon, refresh immediately
        this.refreshTokens()
      } else {
        // Set timer to refresh before expiry
        this.refreshTimer = setTimeout(() => {
          this.refreshTokens()
        }, refreshTime - now)
      }
    } catch {
      // Error parsing token, ignore auto-refresh
    }
  }

  private clearAutoRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = undefined
    }
  }
}