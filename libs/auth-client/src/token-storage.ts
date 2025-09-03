import { TokenStorage } from './types'

export class BrowserTokenStorage implements TokenStorage {
  constructor(private storageType: 'localStorage' | 'sessionStorage' = 'localStorage') {}

  getTokens(): any {
    try {
      const storage = this.storageType === 'localStorage' ? localStorage : sessionStorage
      const tokens = storage.getItem('auth_tokens')
      return tokens ? JSON.parse(tokens) : null
    } catch {
      return null
    }
  }

  setTokens(tokens: any): void {
    try {
      const storage = this.storageType === 'localStorage' ? localStorage : sessionStorage
      storage.setItem('auth_tokens', JSON.stringify(tokens))
    } catch {
      // Ignore storage errors
    }
  }

  clearTokens(): void {
    try {
      const storage = this.storageType === 'localStorage' ? localStorage : sessionStorage
      storage.removeItem('auth_tokens')
    } catch {
      // Ignore storage errors
    }
  }
}

export class MemoryTokenStorage implements TokenStorage {
  private tokens: any = null

  getTokens(): any {
    return this.tokens
  }

  setTokens(tokens: any): void {
    this.tokens = tokens
  }

  clearTokens(): void {
    this.tokens = null
  }
}

export class SecureCookieStorage implements TokenStorage {
  constructor(
    private options: {
      accessTokenName?: string
      refreshTokenName?: string
      secure?: boolean
      sameSite?: 'strict' | 'lax' | 'none'
      domain?: string
    } = {}
  ) {}

  getTokens(): any {
    if (typeof document === 'undefined') return null

    try {
      const accessToken = this.getCookie(this.options.accessTokenName || 'access_token')
      const refreshToken = this.getCookie(this.options.refreshTokenName || 'refresh_token')

      if (!accessToken) return null

      return {
        accessToken,
        refreshToken,
        tokenType: 'Bearer'
      }
    } catch {
      return null
    }
  }

  setTokens(tokens: any): void {
    if (typeof document === 'undefined') return

    try {
      const options = this.buildCookieOptions()
      
      if (tokens.accessToken) {
        this.setCookie(this.options.accessTokenName || 'access_token', tokens.accessToken, options)
      }
      
      if (tokens.refreshToken) {
        this.setCookie(this.options.refreshTokenName || 'refresh_token', tokens.refreshToken, {
          ...options,
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days for refresh token
        })
      }
    } catch {
      // Ignore cookie errors
    }
  }

  clearTokens(): void {
    if (typeof document === 'undefined') return

    try {
      this.deleteCookie(this.options.accessTokenName || 'access_token')
      this.deleteCookie(this.options.refreshTokenName || 'refresh_token')
    } catch {
      // Ignore cookie errors
    }
  }

  private getCookie(name: string): string | null {
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)
    if (parts.length === 2) {
      return parts.pop()?.split(';').shift() || null
    }
    return null
  }

  private setCookie(name: string, value: string, options: any): void {
    let cookie = `${name}=${value}`
    
    if (options.maxAge) cookie += `; Max-Age=${options.maxAge}`
    if (options.secure) cookie += '; Secure'
    if (options.sameSite) cookie += `; SameSite=${options.sameSite}`
    if (options.domain) cookie += `; Domain=${options.domain}`
    cookie += '; Path=/'

    document.cookie = cookie
  }

  private deleteCookie(name: string): void {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/`
    if (this.options.domain) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Domain=${this.options.domain}`
    }
  }

  private buildCookieOptions() {
    return {
      secure: this.options.secure ?? true,
      sameSite: this.options.sameSite ?? 'lax',
      domain: this.options.domain,
      maxAge: 60 * 60 * 1000 // 1 hour for access token
    }
  }
}