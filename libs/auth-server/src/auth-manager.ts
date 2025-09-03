import {
  BaseUser,
  BaseSession,
  AuthProvider,
  AuthResult,
  AuthEngine,
  AuthConfig,
  StorageEngine,
  AuthException
} from '@trpc-template/auth-shared'
import { JWTService, TokenPair } from './jwt'
import { SessionManager } from './session-manager'
import { MemoryStorage } from './storage'

export class AuthManager<TUser extends BaseUser = BaseUser, TSession extends BaseSession = BaseSession> {
  private providers = new Map<string, AuthProvider<any, TUser>>()
  private jwtService: JWTService<TUser, TSession>
  private sessionManager: SessionManager<TUser, TSession>
  private storage: StorageEngine<TUser, TSession>
  private authEngine?: AuthEngine<TUser, TSession>

  constructor(private config: AuthConfig<TUser, TSession>) {
    // Set up storage
    if (config.storage?.customStorage) {
      this.storage = config.storage.customStorage
    } else {
      this.storage = new MemoryStorage<TUser, TSession>()
    }

    // Set up JWT service
    if (!config.jwt?.secret) {
      throw new Error('JWT secret is required')
    }
    this.jwtService = new JWTService(config.jwt)

    // Set up session manager
    this.sessionManager = new SessionManager(this.storage)

    // Set up auth engine
    this.authEngine = config.authEngine

    // Register providers
    config.providers?.forEach(provider => {
      this.useProvider(provider as unknown as AuthProvider<any, TUser>)
    })
  }

  useProvider<TCredentials>(provider: AuthProvider<TCredentials, TUser>): void {
    this.providers.set(provider.name, provider as AuthProvider<any, TUser>)
  }

  async authenticate<TCredentials>(
    providerNameOrFn: string | ((credentials: TCredentials) => Promise<AuthResult<TUser>>),
    credentials: TCredentials
  ): Promise<AuthResult<TUser> & { tokens?: TokenPair }> {
    try {
      let result: AuthResult<TUser>

      // Handle custom authentication function
      if (typeof providerNameOrFn === 'function') {
        result = await providerNameOrFn(credentials)
      }
      // Handle auth engine
      else if (this.authEngine?.authenticate) {
        result = await this.authEngine.authenticate(credentials)
      }
      // Handle registered provider
      else {
        const provider = this.providers.get(providerNameOrFn)
        if (!provider) {
          throw AuthException.providerError(`Provider '${providerNameOrFn}' not found`)
        }

        // Run beforeAuth hook
        let processedCredentials = credentials
        if (provider.beforeAuth) {
          processedCredentials = await provider.beforeAuth(credentials)
        }
        if (this.config.hooks?.beforeAuth) {
          processedCredentials = await this.config.hooks.beforeAuth(processedCredentials)
        }

        // Authenticate
        result = await provider.authenticate(processedCredentials) as AuthResult<TUser>

        // Run afterAuth hook
        if (provider.afterAuth) {
          result = await provider.afterAuth(result) as AuthResult<TUser>
        }
        if (this.config.hooks?.afterAuth) {
          result = await this.config.hooks.afterAuth(result)
        }
      }

      // If authentication failed, return the result
      if (!result.success || !result.user) {
        return result
      }

      // Create session and generate tokens
      const user = result.user as TUser & { id: string }
      const session = await this.sessionManager.createSession(user, result.metadata) as TSession & { id: string }

      // Run token generation hooks
      if (this.config.hooks?.beforeTokenGeneration) {
        await this.config.hooks.beforeTokenGeneration(user, session)
      }

      let tokens: TokenPair
      if (this.authEngine?.generateTokens) {
        tokens = await this.authEngine.generateTokens(user, session)
      } else {
        tokens = await this.jwtService.generateTokenPair(user, session)
      }

      if (this.config.hooks?.afterTokenGeneration) {
        tokens = await this.config.hooks.afterTokenGeneration(tokens, user)
      }

      return {
        success: true,
        user,
        tokens,
        metadata: result.metadata
      }
    } catch (error) {
      if (error instanceof AuthException) {
        return {
          success: false,
          error: error.error
        }
      }

      return {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : 'Unknown authentication error'
        }
      }
    }
  }

  async verifyToken(token: string): Promise<{ user: TUser; session: TSession } | null> {
    try {
      if (this.authEngine?.verifyToken) {
        return await this.authEngine.verifyToken(token)
      }

      const payload = await this.jwtService.verifyToken(token)
      if (!payload || !payload.sub) return null

      const user = await this.storage.getUser(payload.sub)
      if (!user) throw AuthException.userNotFound()

      let session: TSession | null = null
      if (payload.sessionId) {
        session = await this.sessionManager.getSession(payload.sessionId)
        if (!session) throw AuthException.sessionNotFound()
      }

      return { user, session: session as TSession }
    } catch (error) {
      if (error instanceof AuthException) throw error
      return null
    }
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair | null> {
    if (this.authEngine?.refreshTokens) {
      return await this.authEngine.refreshTokens(refreshToken)
    }

    // Default refresh logic would go here
    // For now, return null to indicate refresh not supported
    return null
  }

  async revokeSession(sessionId: string): Promise<boolean> {
    return this.sessionManager.revokeSession(sessionId)
  }

  async revokeAllUserSessions(userId: string): Promise<boolean> {
    return this.sessionManager.revokeAllUserSessions(userId)
  }
}