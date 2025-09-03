import jwt from 'jsonwebtoken'
import { BaseUser, BaseSession, JWTConfig, AuthException } from '@trpc-template/auth-shared'

export interface JWTPayload {
  sub: string
  iat: number
  exp: number
  sessionId?: string
  [key: string]: any
}

export interface TokenPair {
  accessToken: string
  refreshToken?: string
  expiresIn: number
  tokenType: 'Bearer'
}

export class JWTService<TUser = BaseUser, TSession = BaseSession> {
  constructor(private config: JWTConfig) {}

  async generateTokenPair(
    user: TUser & { id: string },
    session?: TSession & { id: string },
    customClaims?: Record<string, any>
  ): Promise<TokenPair> {
    const payload: JWTPayload = {
      sub: user.id,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.parseExpiresIn(this.config.expiresIn || '1h'),
      sessionId: session?.id,
      ...customClaims
    }

    if (this.config.issuer) payload.iss = this.config.issuer
    if (this.config.audience) payload.aud = this.config.audience

    const accessToken = jwt.sign(payload, this.config.secret, {
      algorithm: (this.config.algorithm as any) || 'HS256'
    })

    return {
      accessToken,
      expiresIn: payload.exp - payload.iat,
      tokenType: 'Bearer'
    }
  }

  async verifyToken(token: string): Promise<JWTPayload | null> {
    try {
      const decoded = jwt.verify(token, this.config.secret, {
        algorithms: [(this.config.algorithm as any) || 'HS256']
      }) as JWTPayload

      return decoded
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw AuthException.tokenExpired()
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw AuthException.tokenInvalid()
      }
      return null
    }
  }

  async generateAccessToken(payload: Partial<JWTPayload>): Promise<string> {
    const fullPayload: JWTPayload = {
      sub: payload.sub || '',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.parseExpiresIn(this.config.expiresIn || '1h'),
      ...payload
    }

    return jwt.sign(fullPayload, this.config.secret, {
      algorithm: (this.config.algorithm as any) || 'HS256'
    })
  }

  private parseExpiresIn(expiresIn: string): number {
    const units: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
      w: 604800
    }

    const match = expiresIn.match(/^(\d+)([smhdw])$/)
    if (!match) throw new Error('Invalid expiresIn format')

    const [, value, unit] = match
    return parseInt(value) * units[unit]
  }
}