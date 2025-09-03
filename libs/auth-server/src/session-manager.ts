import { BaseUser, BaseSession, StorageEngine, AuthException, DEFAULT_SESSION_EXPIRES_IN } from '@trpc-template/auth-shared'
import { randomUUID } from 'crypto'

export interface SessionData extends BaseSession {
  id: string
  userId: string
  expiresAt: Date
  createdAt: Date
  metadata?: Record<string, any>
}

export class SessionManager<TUser = BaseUser, TSession = SessionData> {
  constructor(
    private storage: StorageEngine<TUser, TSession>,
    private sessionExpiresIn: number = DEFAULT_SESSION_EXPIRES_IN
  ) {}

  async createSession(user: TUser & { id: string }, metadata?: Record<string, any>): Promise<TSession> {
    const sessionData = {
      id: randomUUID(),
      userId: user.id,
      expiresAt: new Date(Date.now() + this.sessionExpiresIn),
      createdAt: new Date(),
      metadata
    } as TSession

    return this.storage.saveSession(sessionData)
  }

  async getSession(sessionId: string): Promise<TSession | null> {
    const session = await this.storage.getSession(sessionId)
    if (!session) return null

    // Check if session has expired
    const sessionData = session as unknown as SessionData
    if (sessionData.expiresAt && new Date() > sessionData.expiresAt) {
      await this.storage.deleteSession(sessionId)
      throw AuthException.sessionExpired()
    }

    return session
  }

  async refreshSession(sessionId: string): Promise<TSession | null> {
    const session = await this.getSession(sessionId)
    if (!session) return null

    const sessionData = session as unknown as SessionData
    const updatedSession = {
      ...sessionData,
      expiresAt: new Date(Date.now() + this.sessionExpiresIn)
    } as TSession

    return this.storage.saveSession(updatedSession)
  }

  async revokeSession(sessionId: string): Promise<boolean> {
    return this.storage.deleteSession(sessionId)
  }

  async revokeAllUserSessions(userId: string): Promise<boolean> {
    return this.storage.deleteUserSessions(userId)
  }

  async validateSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId)
      return !!session
    } catch {
      return false
    }
  }
}