import bcrypt from 'bcrypt'
import { AuthProvider, AuthResult, BaseUser, AuthException } from '@trpc-template/auth-shared'
// import { randomUUID } from 'crypto' // Unused for now but may be needed for user ID generation

export interface EmailPasswordCredentials {
  email: string
  password: string
}

export interface EmailPasswordUser extends BaseUser {
  id: string
  email: string
  passwordHash: string
  authMethod: 'email_password'
  emailVerified?: boolean
  createdAt: Date
  updatedAt: Date
}

export interface EmailPasswordConfig {
  saltRounds?: number
  minPasswordLength?: number
  requireEmailVerification?: boolean
  userStorage: {
    findByEmail: (email: string) => Promise<EmailPasswordUser | null>
    create: (data: Omit<EmailPasswordUser, 'id' | 'createdAt' | 'updatedAt'>) => Promise<EmailPasswordUser>
    updatePassword: (userId: string, passwordHash: string) => Promise<void>
  }
}

export class EmailPasswordProvider implements AuthProvider<EmailPasswordCredentials, EmailPasswordUser> {
  readonly name = 'email_password'

  constructor(private config: EmailPasswordConfig) {}

  async authenticate(credentials: EmailPasswordCredentials): Promise<AuthResult<EmailPasswordUser>> {
    try {
      const { email, password } = credentials

      if (!email || !password) {
        throw AuthException.invalidCredentials('Email and password are required')
      }

      // Find user by email
      const user = await this.config.userStorage.findByEmail(email.toLowerCase())
      if (!user) {
        throw AuthException.invalidCredentials('Invalid email or password')
      }

      // Check email verification if required
      if (this.config.requireEmailVerification && !user.emailVerified) {
        throw AuthException.validationError('Email verification required')
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.passwordHash)
      if (!isValid) {
        throw AuthException.invalidCredentials('Invalid email or password')
      }

      // Remove sensitive data before returning
      const { passwordHash, ...safeUser } = user

      return {
        success: true,
        user: safeUser as EmailPasswordUser
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
          code: 'AUTHENTICATION_ERROR',
          message: error instanceof Error ? error.message : 'Authentication failed'
        }
      }
    }
  }

  async register(
    credentials: EmailPasswordCredentials & { confirmPassword: string }
  ): Promise<AuthResult<EmailPasswordUser>> {
    try {
      const { email, password, confirmPassword } = credentials

      // Validation
      if (!email || !password) {
        throw AuthException.validationError('Email and password are required')
      }

      if (password !== confirmPassword) {
        throw AuthException.validationError('Passwords do not match')
      }

      const minLength = this.config.minPasswordLength || 8
      if (password.length < minLength) {
        throw AuthException.validationError(`Password must be at least ${minLength} characters long`)
      }

      // Check if user already exists
      const existingUser = await this.config.userStorage.findByEmail(email.toLowerCase())
      if (existingUser) {
        throw AuthException.validationError('User with this email already exists')
      }

      // Hash password
      const saltRounds = this.config.saltRounds || 12
      const passwordHash = await bcrypt.hash(password, saltRounds)

      // Create user
      const newUser = await this.config.userStorage.create({
        email: email.toLowerCase(),
        passwordHash,
        authMethod: 'email_password',
        emailVerified: !this.config.requireEmailVerification
      })

      // Remove sensitive data
      const { passwordHash: _, ...safeUser } = newUser

      return {
        success: true,
        user: safeUser as EmailPasswordUser
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
          code: 'REGISTRATION_ERROR',
          message: error instanceof Error ? error.message : 'Registration failed'
        }
      }
    }
  }

  async changePassword(
    _userId: string,
    _currentPassword: string,
    _newPassword: string
  ): Promise<boolean> {
    try {
      // This would need the user storage to also support finding by ID
      // Implementation would depend on your specific storage solution
      throw new Error('Change password not implemented - requires user storage by ID')
    } catch {
      return false
    }
  }

  async resetPassword(email: string): Promise<boolean> {
    try {
      // Implementation would depend on your email service and reset token storage
      // This is just a placeholder
      const user = await this.config.userStorage.findByEmail(email.toLowerCase())
      if (!user) return false

      // Generate reset token, send email, etc.
      return true
    } catch {
      return false
    }
  }
}