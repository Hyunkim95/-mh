import { AuthProvider, AuthResult, BaseUser, AuthException } from '@trpc-template/auth-shared'
import { verifySignature, generateNonce, createMessage } from '@libs/solana-node'

export interface SolanaWalletCredentials {
  publicKey: string
  signature: string
  message: string
  timestamp: number
}

export interface SolanaWalletUser extends BaseUser {
  id: string
  publicKey: string
  walletAddress: string
  authMethod: 'solana_wallet'
  lastLoginAt?: Date
}

export interface SolanaWalletConfig {
  signatureValidWindow?: number // seconds
  messageTemplate?: string
  userStorage?: {
    findByPublicKey: (publicKey: string) => Promise<SolanaWalletUser | null>
    create: (data: Omit<SolanaWalletUser, 'id'> & { id?: string }) => Promise<SolanaWalletUser>
    update: (publicKey: string, data: Partial<SolanaWalletUser>) => Promise<SolanaWalletUser>
  }
}

export class SolanaWalletProvider implements AuthProvider<SolanaWalletCredentials, SolanaWalletUser> {
  readonly name = 'solana_wallet'

  constructor(private config: SolanaWalletConfig = {}) {}

  async authenticate(credentials: SolanaWalletCredentials): Promise<AuthResult<SolanaWalletUser>> {
    try {
      const { publicKey, signature, message, timestamp } = credentials

      if (!publicKey || !signature || !message) {
        throw AuthException.invalidCredentials('Public key, signature, and message are required')
      }

      // Verify timestamp is within acceptable window
      const validWindow = this.config.signatureValidWindow || 300 // 5 minutes default
      const now = Date.now()
      if (Math.abs(now - timestamp) > validWindow * 1000) {
        throw AuthException.validationError('Signature timestamp expired')
      }

      // Extract nonce from message
      const nonceMatch = message.match(/Nonce:\s*([a-zA-Z0-9]+)/)
      const nonce = nonceMatch ? nonceMatch[1] : ''

      if (!nonce) {
        throw AuthException.invalidCredentials('Invalid message format - nonce not found')
      }

      // Verify signature using solana-node library
      const isValidSignature = await verifySignature(publicKey, nonce, signature)
      
      if (!isValidSignature) {
        throw AuthException.invalidCredentials('Invalid signature')
      }

      // Get or create user
      let user: SolanaWalletUser | null

      if (this.config.userStorage) {
        // Use custom user storage
        user = await this.config.userStorage.findByPublicKey(publicKey)
        if (user) {
          // Update last login
          user = await this.config.userStorage.update(publicKey, { lastLoginAt: new Date() })
        } else {
          // Create new user
          user = await this.config.userStorage.create({
            publicKey,
            walletAddress: publicKey,
            authMethod: 'solana_wallet',
            lastLoginAt: new Date()
          })
        }
      } else {
        // Default user object
        user = {
          id: publicKey,
          publicKey,
          walletAddress: publicKey,
          authMethod: 'solana_wallet',
          lastLoginAt: new Date()
        }
      }

      return {
        success: true,
        user
      }
    } catch (error) {
      if (error instanceof AuthException) {
        return {
          success: false,
          error: (error as AuthException).error
        }
      }

      return {
        success: false,
        error: {
          code: 'SOLANA_AUTH_ERROR',
          message: error instanceof Error ? error.message : 'Solana authentication failed'
        }
      }
    }
  }

  // Helper method to create challenge using solana-node library
  static createChallenge(): { nonce: string; message: string } {
    const nonce = generateNonce()
    return {
      nonce,
      message: createMessage(nonce)
    }
  }

  // Helper method to create message for a specific nonce
  static createMessageForNonce(nonce: string): string {
    return createMessage(nonce)
  }
}