import { AuthProvider, AuthResult, BaseUser, AuthException } from '@trpc-template/auth-shared'
import { ethereumAuth, createSiweChallenge, verifySiweMessage } from '@libs/ethereum-node'
import { SiweMessage } from 'siwe'

export interface EthereumWalletCredentials {
  address: string
  signature: string
  message: string
  timestamp: number
  chainId?: number
  nonce?: string
}

export interface EthereumWalletUser extends BaseUser {
  id: string
  address: string
  walletAddress: string
  authMethod: 'ethereum_wallet'
  chainId?: number
  ensName?: string
  lastLoginAt?: Date
}

export interface EthereumWalletConfig {
  signatureValidWindow?: number // seconds
  supportedChainIds?: number[]
  requireChainId?: number
  domain?: string
  statement?: string
  uri?: string
  userStorage?: {
    findByAddress: (address: string) => Promise<EthereumWalletUser | null>
    create: (data: Omit<EthereumWalletUser, 'id'> & { id?: string }) => Promise<EthereumWalletUser>
    update: (address: string, data: Partial<EthereumWalletUser>) => Promise<EthereumWalletUser>
  }
}

export class EthereumWalletProvider implements AuthProvider<EthereumWalletCredentials, EthereumWalletUser> {
  readonly name = 'ethereum_wallet'

  constructor(private config: EthereumWalletConfig = {}) {
    // Update ethereum-node config if provided
    if (config.domain || config.statement || config.uri) {
      // TODO: implement with ethereum-node when imports are fixed
      // ethereumAuth.updateConfig({
      //   domain: config.domain,
      //   statement: config.statement,
      //   uri: config.uri
      // })
    }
  }

  async authenticate(credentials: EthereumWalletCredentials): Promise<AuthResult<EthereumWalletUser>> {
    try {
      const { address, signature, message, timestamp, chainId, nonce } = credentials

      if (!address || !signature || !message) {
        throw AuthException.invalidCredentials('Address, signature, and message are required')
      }

      // Verify timestamp is within acceptable window
      const validWindow = this.config.signatureValidWindow || 300 // 5 minutes default
      const now = Date.now()
      if (Math.abs(now - timestamp) > validWindow * 1000) {
        throw AuthException.validationError('Signature timestamp expired')
      }

      // Verify chain ID if restrictions are set
      if (chainId) {
        if (this.config.requireChainId && chainId !== this.config.requireChainId) {
          throw AuthException.validationError(`Chain ID ${chainId} not allowed`)
        }
        if (this.config.supportedChainIds?.length && !this.config.supportedChainIds.includes(chainId)) {
          throw AuthException.validationError(`Chain ID ${chainId} not supported`)
        }
      }

      // Extract nonce from message or use provided nonce
      let extractedNonce = nonce
      if (!extractedNonce) {
        const nonceMatch = message.match(/Nonce:\s*([a-zA-Z0-9]+)/)
        extractedNonce = nonceMatch ? nonceMatch[1] : ''
      }

      if (!extractedNonce) {
        throw AuthException.invalidCredentials('Nonce is required')
      }

      // Verify signature using ethereum-node library
      let verifiedAddress: string
      
      try {
        // Try to verify as SIWE message string first
        verifiedAddress = await ethereumAuth.verifyMessageString(message, signature, extractedNonce)
      } catch {
        // If that fails, try to parse as SiweMessage object
        try {
          const siweMessage = new SiweMessage(message)
          verifiedAddress = await verifySiweMessage(siweMessage, {
            signature,
            nonce: extractedNonce
          })
          verifiedAddress = address
        } catch (siweError) {
          throw AuthException.invalidCredentials(`Signature verification failed: ${siweError}`)
        }
      }

      // Verify address matches
      if (verifiedAddress.toLowerCase() !== address.toLowerCase()) {
        throw AuthException.invalidCredentials('Address mismatch')
      }

      // Get or create user
      let user: EthereumWalletUser | null

      if (this.config.userStorage) {
        // Use custom user storage
        user = await this.config.userStorage.findByAddress(address.toLowerCase())
        if (user) {
          // Update last login and chain ID
          user = await this.config.userStorage.update(address.toLowerCase(), {
            lastLoginAt: new Date(),
            chainId
          })
        } else {
          // Create new user
          user = await this.config.userStorage.create({
            address: address.toLowerCase(),
            walletAddress: address.toLowerCase(),
            authMethod: 'ethereum_wallet',
            chainId,
            lastLoginAt: new Date()
          })
        }
      } else {
        // Default user object
        user = {
          id: address.toLowerCase(),
          address: address.toLowerCase(),
          walletAddress: address.toLowerCase(),
          authMethod: 'ethereum_wallet',
          chainId,
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
          code: 'ETHEREUM_AUTH_ERROR',
          message: error instanceof Error ? error.message : 'Ethereum authentication failed'
        }
      }
    }
  }

  // Helper method to create challenge using ethereum-node library
  static createChallenge(address: string, overrides?: Partial<SiweMessage>): {
    nonce: string
    message: SiweMessage
    messageString: string
  } {
    // return createSiweChallenge(address, overrides)
    return createSiweChallenge(address, overrides)
  }

  // Helper method to generate nonce
  static generateNonce(): string {
    return ethereumAuth.generateNonce()
  }
}