# Authentication Libraries Usage Guide

## Overview

The authentication system consists of multiple libraries that work together:

- **`auth-shared`**: Base types and interfaces
- **`auth-server`**: Server-side JWT utilities, middleware, providers
- **`auth-client`**: Client-side state management and React hooks
- **`auth-solana-client`**: Solana wallet integration
- **`auth-ethereum-client`**: Ethereum wallet integration

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                        │
├─────────────────────┬───────────────────┬───────────────────┤
│   auth-client       │  auth-solana-    │  auth-ethereum-   │
│   (State & Hooks)   │     client        │     client        │
├─────────────────────┼───────────────────┼───────────────────┤
│   Uses existing:    │  Uses existing:   │  Uses existing:   │
│   - auth-shared     │  - solana-client  │  - ethereum-      │
│                     │  - solana-node    │    client         │
│                     │                   │  - ethereum-node  │
└─────────────────────┴───────────────────┴───────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Node.js)                       │
├─────────────────────────────────────────────────────────────┤
│   auth-server (JWT, Middleware, Providers)                 │
│   Uses existing:                                            │
│   - ethereum-node (SIWE verification)                      │
│   - solana-node (Signature verification)                   │
│   - auth-shared (Types)                                     │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### 🔧 **Override-First Design**
- **Complete customization** of any authentication step
- **Plugin system** for different auth methods
- **Flexible configuration** with sensible defaults

### 🏗️ **Existing Library Integration**
- **Leverages your existing** `ethereum-node`, `solana-node`, `ethereum-client`, `solana-client` libraries
- **Wraps and enhances** existing functionality
- **Fallback implementations** when existing libraries aren't available

### 🎯 **Production Ready**
- **TypeScript-first** with full type safety
- **Framework agnostic** core with React integration
- **Secure defaults** with configurable options

## Usage Examples

### Server-Side Setup

```typescript
import { AuthManager, EmailPasswordProvider, SolanaWalletProvider, EthereumWalletProvider } from '@trpc-template/auth-server'
import { createAuthMiddleware } from '@trpc-template/auth-server'

// Basic setup with built-in providers
const authManager = new AuthManager({
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: '1h'
  },
  providers: [
    new EmailPasswordProvider({
      userStorage: {
        findByEmail: async (email) => /* your DB logic */,
        create: async (userData) => /* your DB logic */,
        updatePassword: async (userId, hash) => /* your DB logic */
      }
    }),
    new SolanaWalletProvider(),
    new EthereumWalletProvider()
  ]
})

// tRPC middleware
const authMiddleware = createAuthMiddleware(authManager)

// Use in your tRPC procedures
const protectedProcedure = publicProcedure
  .use(authMiddleware())
  .query(({ ctx }) => {
    // ctx.auth contains user and session
    return { user: ctx.auth.user }
  })
```

### Complete Custom Authentication

```typescript
// Override the entire authentication process
const customAuthEngine = {
  authenticate: async (credentials: MyCredentials) => {
    // Your completely custom authentication logic
    const user = await validateWithThirdPartyService(credentials)
    return { success: true, user }
  },
  generateTokens: async (user, session) => {
    // Your custom token generation
    return {
      accessToken: await generateCustomJWT(user),
      refreshToken: await generateCustomRefresh(session),
      customToken: await generateThirdPartyToken(user)
    }
  }
}

const authManager = new AuthManager({
  jwt: { secret: process.env.JWT_SECRET! },
  authEngine: customAuthEngine
})
```

### Client-Side Setup

```typescript
import { AuthProvider, useAuth } from '@trpc-template/auth-client'
import { useSolanaAuthIntegration, useSolanaWalletAuth } from '@trpc-template/auth-solana-client'
import { useEthereumAuthIntegration, useEthereumWalletAuth } from '@trpc-template/auth-ethereum-client'

// App root setup
function App() {
  return (
    <AuthProvider config={{
      apiUrl: '/api/auth',
      tokenStorage: 'localStorage',
      autoRefresh: true
    }}>
      <MyApp />
    </AuthProvider>
  )
}

// In your components
function LoginComponent() {
  const { login, logout, state } = useAuth()
  const solanaAuth = useSolanaWalletAuth()
  const ethereumAuth = useEthereumWalletAuth()

  // Traditional email/password
  const handleEmailLogin = async () => {
    await login('email_password', { email, password })
  }

  // Solana wallet (uses your existing solana-client)
  const handleSolanaLogin = async () => {
    await solanaAuth.connectAndAuthenticate()
  }

  // Ethereum wallet (uses your existing ethereum-client)
  const handleEthereumLogin = async () => {
    await ethereumAuth.connectAndAuthenticate()
  }

  // Custom authentication
  const handleCustomLogin = async () => {
    const customAuth = async (credentials) => {
      // Your custom client-side auth logic
      return { success: true, user: myUser, tokens: myTokens }
    }
    
    await login(customAuth, credentials)
  }
}
```

### Advanced Wallet Integration

```typescript
// Solana authentication (leverages your solana-client)
function SolanaLoginButton() {
  const { authenticateWithSolana, solanaAuth } = useSolanaAuthIntegration()
  
  return (
    <button 
      onClick={authenticateWithSolana}
      disabled={!solanaAuth?.connected}
    >
      {solanaAuth?.connected ? 'Sign In with Solana' : 'Connect Wallet'}
    </button>
  )
}

// Ethereum authentication (leverages your ethereum-client)
function EthereumLoginButton() {
  const { connectAndAuthenticate, isConnected } = useEthereumWalletAuth()
  
  return (
    <button onClick={connectAndAuthenticate}>
      {isConnected ? 'Sign In with Ethereum' : 'Connect & Sign In'}
    </button>
  )
}
```

### Per-Case Authentication Override

```typescript
// Different auth logic for different scenarios
const authManager = new AuthManager(config)

// Standard provider
await authManager.authenticate('email_password', { email, password })

// Custom OAuth flow
const oauthAuth = async (credentials) => {
  const token = await exchangeCodeForToken(credentials.code)
  const user = await fetchUserFromProvider(token)
  return { success: true, user }
}
await authManager.authenticate(oauthAuth, { code: 'oauth_code' })

// Custom blockchain authentication
const blockchainAuth = async (credentials) => {
  const isValid = await verifyCustomSignature(credentials)
  if (!isValid) return { success: false, error: { code: 'INVALID_SIG', message: 'Invalid signature' }}
  
  return { success: true, user: { id: credentials.address, authMethod: 'custom' } }
}
await authManager.authenticate(blockchainAuth, walletCredentials)
```

## Integration with Existing Libraries

### Solana Integration
- **Uses `@trpc-template/solana-client`** for wallet connection and signing
- **Uses `@trpc-template/solana-node`** for server-side signature verification
- **Fallback implementations** when libraries aren't available

### Ethereum Integration
- **Uses `@trpc-template/ethereum-client`** for wallet connection and SIWE
- **Uses `@trpc-template/ethereum-node`** for server-side SIWE verification
- **Supports EIP-4361** (Sign-In with Ethereum) standard
- **Wagmi compatibility** for modern Ethereum apps

## Benefits of This Approach

1. **Leverage Existing Work**: Uses your existing authentication libraries
2. **Maximum Flexibility**: Override any part of the authentication flow
3. **Progressive Enhancement**: Start simple, add complexity as needed
4. **Type Safety**: Full TypeScript support throughout
5. **Production Ready**: Built-in security, error handling, and testing support

## Next Steps

1. **Install the packages** you need for your specific use case
2. **Configure the server-side** authentication providers
3. **Set up client-side** React providers and hooks
4. **Customize as needed** using the override system