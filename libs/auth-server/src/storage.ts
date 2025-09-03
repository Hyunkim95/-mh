import { BaseUser, BaseSession, StorageEngine } from '@trpc-template/auth-shared'

export class MemoryStorage<TUser = BaseUser, TSession = BaseSession> implements StorageEngine<TUser, TSession> {
  private users = new Map<string, TUser>()
  private sessions = new Map<string, TSession>()

  async saveUser(user: TUser & { id: string }): Promise<TUser> {
    this.users.set(user.id, user)
    return user
  }

  async getUser(id: string): Promise<TUser | null> {
    return this.users.get(id) || null
  }

  async updateUser(id: string, data: Partial<TUser>): Promise<TUser> {
    const existing = this.users.get(id)
    if (!existing) throw new Error('User not found')
    
    const updated = { ...existing, ...data } as TUser
    this.users.set(id, updated)
    return updated
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id)
  }

  async saveSession(session: TSession & { id: string }): Promise<TSession> {
    this.sessions.set(session.id, session)
    return session
  }

  async getSession(id: string): Promise<TSession | null> {
    return this.sessions.get(id) || null
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.sessions.delete(id)
  }

  async deleteUserSessions(userId: string): Promise<boolean> {
    let deleted = false
    for (const [sessionId, session] of this.sessions) {
      if ((session as any).userId === userId) {
        this.sessions.delete(sessionId)
        deleted = true
      }
    }
    return deleted
  }
}

export class DatabaseStorage<TUser = BaseUser, TSession = BaseSession> implements StorageEngine<TUser, TSession> {
  // @ts-expect-error - This is an abstract class, db is used in subclass implementations
  constructor(private _db: any) {} // Accept any database client

  async saveUser(_user: TUser & { id: string }): Promise<TUser> {
    // Override this method with your specific database implementation
    throw new Error('DatabaseStorage.saveUser must be implemented')
  }

  async getUser(_id: string): Promise<TUser | null> {
    throw new Error('DatabaseStorage.getUser must be implemented')
  }

  async updateUser(_id: string, _data: Partial<TUser>): Promise<TUser> {
    throw new Error('DatabaseStorage.updateUser must be implemented')
  }

  async deleteUser(_id: string): Promise<boolean> {
    throw new Error('DatabaseStorage.deleteUser must be implemented')
  }

  async saveSession(_session: TSession & { id: string }): Promise<TSession> {
    throw new Error('DatabaseStorage.saveSession must be implemented')
  }

  async getSession(_id: string): Promise<TSession | null> {
    throw new Error('DatabaseStorage.getSession must be implemented')
  }

  async deleteSession(_id: string): Promise<boolean> {
    throw new Error('DatabaseStorage.deleteSession must be implemented')
  }

  async deleteUserSessions(_userId: string): Promise<boolean> {
    throw new Error('DatabaseStorage.deleteUserSessions must be implemented')
  }
}