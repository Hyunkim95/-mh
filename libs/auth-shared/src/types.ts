export interface BaseUser {
  id: string
  [key: string]: any
}

export interface BaseSession {
  id: string
  userId: string
  [key: string]: any
}

export interface AuthError {
  code: string
  message: string
  [key: string]: any
}

export interface AuthResult<TUser = BaseUser, TTokens = any> {
  success: boolean
  user?: TUser
  tokens?: TTokens
  metadata?: Record<string, any>
  error?: AuthError
}

export interface AuthProvider<TCredentials = any, TUser = BaseUser> {
  name: string
  authenticate: (credentials: TCredentials) => Promise<AuthResult<TUser>>
  validate?: (user: TUser) => Promise<boolean>
  beforeAuth?: (credentials: TCredentials) => Promise<TCredentials>
  afterAuth?: (result: AuthResult<TUser>) => Promise<AuthResult<TUser>>
}

export interface AuthEngine<TUser = BaseUser, TSession = BaseSession, TCredentials = any> {
  authenticate?(credentials: TCredentials): Promise<AuthResult<TUser>>
  createUser?(data: any): Promise<TUser>
  updateUser?(id: string, data: any): Promise<TUser>
  getUser?(id: string): Promise<TUser | null>
  createSession?(user: TUser): Promise<TSession>
  getSession?(id: string): Promise<TSession | null>
  revokeSession?(id: string): Promise<boolean>
  generateTokens?(user: TUser, session: TSession): Promise<any>
  verifyToken?(token: string): Promise<{ user: TUser; session: TSession } | null>
  refreshTokens?(refreshToken: string): Promise<any>
  beforeAuth?(credentials: TCredentials): Promise<TCredentials>
  afterAuth?(result: AuthResult<TUser>): Promise<AuthResult<TUser>>
  beforeTokenGeneration?(user: TUser, session: TSession): Promise<void>
  afterTokenGeneration?(tokens: any, user: TUser): Promise<any>
}

export interface StorageEngine<TUser = BaseUser, TSession = BaseSession> {
  saveUser(user: TUser): Promise<TUser>
  getUser(id: string): Promise<TUser | null>
  updateUser(id: string, data: Partial<TUser>): Promise<TUser>
  deleteUser(id: string): Promise<boolean>
  saveSession(session: TSession): Promise<TSession>
  getSession(id: string): Promise<TSession | null>
  deleteSession(id: string): Promise<boolean>
  deleteUserSessions(userId: string): Promise<boolean>
}

export interface JWTConfig {
  secret: string
  expiresIn?: string
  algorithm?: string
  issuer?: string
  audience?: string
}

export interface AuthConfig<TUser = BaseUser, TSession = BaseSession> {
  jwt?: JWTConfig
  storage?: {
    type: 'memory' | 'database' | 'redis' | 'custom'
    connection?: any
    customStorage?: StorageEngine<TUser, TSession>
  }
  authEngine?: AuthEngine<TUser, TSession>
  providers?: AuthProvider[]
  hooks?: {
    beforeAuth?: (credentials: any) => Promise<any>
    afterAuth?: (result: AuthResult<TUser>) => Promise<AuthResult<TUser>>
    beforeTokenGeneration?: (user: TUser, session: TSession) => Promise<void>
    afterTokenGeneration?: (tokens: any, user: TUser) => Promise<any>
  }
}