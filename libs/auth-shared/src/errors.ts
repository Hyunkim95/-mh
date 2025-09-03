import { AuthError } from './types'
import { AuthErrorCode } from './constants'

export class AuthException extends Error {
  public readonly error: AuthError

  constructor(code: string, message: string, details?: Record<string, any>) {
    super(message)
    this.name = 'AuthException'
    this.error = { code, message, ...details }
  }

  static invalidCredentials(message = 'Invalid credentials') {
    return new AuthException(AuthErrorCode.INVALID_CREDENTIALS, message)
  }

  static userNotFound(message = 'User not found') {
    return new AuthException(AuthErrorCode.USER_NOT_FOUND, message)
  }

  static tokenExpired(message = 'Token has expired') {
    return new AuthException(AuthErrorCode.TOKEN_EXPIRED, message)
  }

  static tokenInvalid(message = 'Invalid token') {
    return new AuthException(AuthErrorCode.TOKEN_INVALID, message)
  }

  static sessionExpired(message = 'Session has expired') {
    return new AuthException(AuthErrorCode.SESSION_EXPIRED, message)
  }

  static sessionNotFound(message = 'Session not found') {
    return new AuthException(AuthErrorCode.SESSION_NOT_FOUND, message)
  }

  static providerError(message = 'Authentication provider error', details?: Record<string, any>) {
    return new AuthException(AuthErrorCode.PROVIDER_ERROR, message, details)
  }

  static validationError(message = 'Validation error', details?: Record<string, any>) {
    return new AuthException(AuthErrorCode.VALIDATION_ERROR, message, details)
  }

  static networkError(message = 'Network error') {
    return new AuthException(AuthErrorCode.NETWORK_ERROR, message)
  }

  static unknown(message = 'Unknown error', details?: Record<string, any>) {
    return new AuthException(AuthErrorCode.UNKNOWN_ERROR, message, details)
  }
}