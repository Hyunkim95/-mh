# Solana Authentication System

This document describes the complete Solana-based authentication system implemented for the Multi-Hopper project using functional programming patterns, tRPC, and modern React practices.

## 🏗️ Architecture Overview

The authentication system consists of:

- **Backend API** (`apps/api`) - Fastify + tRPC server with Solana authentication
- **Frontend Web** (`apps/web`) - React application with Solana wallet integration
- **Server Library** (`libs/server`) - Shared backend utilities and database schema
- **Solana Node** (`libs/solana-node`) - Server-side Solana integration
- **Solana Client** (`libs/solana-client`) - Client-side wallet integration

## 🔧 Backend Components

### Authentication Service (`libs/server/src/auth/services/auth.service.ts`)

**Functional approach** with pure functions for:

```typescript
// Core authentication functions
generateAuthChallenge(publicKey: string): Promise<{ nonce: string; message: string }>
verifySignatureAndCreateSession(publicKey: string, nonce: string, signature: string, isHardwareWallet?: boolean): Promise<AuthResult>
verifyAuthToken(token: string): Promise<AuthContext>
logoutUser(token: string): Promise<boolean>

// User management
updateUserRole(publicKey: string, newRole: 'user' | 'admin'): Promise<User | null>
getUserByPublicKey(publicKey: string): Promise<User | null>
createUser(publicKey: string, role?: 'user' | 'admin'): Promise<User>

// Session management
getUserSessions(userId: number): Promise<Session[]>
revokeAllUserSessions(userId: number): Promise<number>
cleanupExpiredSessions(): Promise<void>

// Utility functions
isAdmin(user: User | null): boolean
hasRole(user: User | null, role: 'user' | 'admin'): boolean
extractTokenFromHeader(authHeader: string | undefined): string | null
```

### tRPC Authentication Router (`libs/server/src/auth/routers/auth.router.ts`)

```typescript
export const authRouter = router({
  // Public endpoints
  challenge: publicProcedure.input(challengeSchema).mutation(...)
  verify: publicProcedure.input(verifySchema).mutation(...)
  health: publicProcedure.query(...)
  
  // Protected endpoints
  me: protectedProcedure.query(...)
  logout: protectedProcedure.mutation(...)
  
  // Admin endpoints
  updateRole: adminProcedure.input(updateRoleSchema).mutation(...)
  getUserSessions: adminProcedure.input(userIdSchema).query(...)
  revokeUserSessions: adminProcedure.input(revokeSessionsSchema).mutation(...)
  cleanup: adminProcedure.mutation(...)
})
```

### Database Schema (`libs/server/src/auth/schema/auth.schema.ts`)

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  public_key VARCHAR(44) UNIQUE NOT NULL,
  role VARCHAR(10) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sessions table  
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Auth challenges table
CREATE TABLE auth_challenges (
  id SERIAL PRIMARY KEY,
  public_key VARCHAR(44) NOT NULL,
  nonce VARCHAR(32) NOT NULL,
  message TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 🌐 Frontend Components

### Authentication Context (`apps/web/src/context/AuthContext.tsx`)

```typescript
interface AuthContextType {
  // State
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  
  // Actions
  login: (publicKey: string, signature: string, nonce: string, isHardwareWallet?: boolean) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  clearError: () => void
}

const useAuth = (): AuthContextType
```

### Wallet Integration Hooks

```typescript
// Wallet connection management
const useWalletConnection = () => ({
  wallet,
  connected,
  connecting,
  connect,
  disconnect,
  error,
  isHardwareWallet
})

// Solana authentication flow
const useSolanaAuth = () => ({
  authenticate,
  isAuthenticating,
  error,
  clearError
})
```

### Protection Components

```typescript
// Route protection
<ProtectedRoute fallback={<LoginPage />}>
  <Dashboard />
</ProtectedRoute>

// Admin-only routes
<AdminRoute>
  <AdminPanel />
</AdminRoute>

// Role-based rendering
<AdminOnly fallback={<div>Access denied</div>}>
  <AdminControls />
</AdminOnly>

<UserOrAdmin>
  <UserDashboard />
</UserOrAdmin>
```

## 🚀 Usage Examples

### 1. Basic Authentication Flow

```typescript
import { useAuth, useWalletConnection, useSolanaAuth } from '@/hooks'

function LoginComponent() {
  const { user, isAuthenticated, logout } = useAuth()
  const { wallet, connected, connect } = useWalletConnection()
  const { authenticate, isAuthenticating, error } = useSolanaAuth()

  const handleLogin = async () => {
    if (!connected) {
      await connect()
    }
    if (wallet) {
      await authenticate(wallet.adapter.publicKey!.toString())
    }
  }

  if (isAuthenticated) {
    return (
      <div>
        <p>Welcome, {user?.publicKey}!</p>
        <p>Role: {user?.role}</p>
        <button onClick={logout}>Logout</button>
      </div>
    )
  }

  return (
    <div>
      <button onClick={handleLogin} disabled={isAuthenticating}>
        {isAuthenticating ? 'Signing...' : 'Connect & Sign'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
```

### 2. tRPC Integration

```typescript
import { trpc } from '@/lib/trpc'

function UserProfile() {
  const { data: userInfo, isLoading } = trpc.auth.me.useQuery()
  const updateRole = trpc.auth.updateRole.useMutation()
  
  if (isLoading) return <div>Loading...</div>
  
  return (
    <div>
      <h1>User Profile</h1>
      <p>Public Key: {userInfo?.data.user.publicKey}</p>
      <p>Role: {userInfo?.data.user.role}</p>
      <p>Member since: {userInfo?.data.user.createdAt}</p>
    </div>
  )
}
```

### 3. Admin Operations

```typescript
function AdminPanel() {
  const cleanup = trpc.auth.cleanup.useMutation()
  const getUserSessions = trpc.auth.getUserSessions.useQuery
  
  return (
    <AdminOnly>
      <div>
        <h2>Admin Panel</h2>
        <button onClick={() => cleanup.mutate()}>
          Cleanup Expired Sessions
        </button>
        
        <UserSessionsTable />
      </div>
    </AdminOnly>
  )
}
```

## 🔒 Security Features

### JWT Token Management
- **Secure Storage**: Tokens stored in localStorage with HttpOnly option consideration
- **Auto-Refresh**: Tokens automatically refreshed before expiration
- **Session Validation**: Server-side session validation on each request
- **Expiration**: Configurable token expiry (default 7 days)

### Challenge-Response Authentication
- **Cryptographic Nonces**: Secure random nonce generation
- **Single-Use Challenges**: Challenges marked as used after verification
- **Time-Limited**: Challenges expire after 10 minutes (configurable)
- **Hardware Wallet Support**: Different signing flow for Ledger/Trezor

### Database Security
- **SQL Injection Protection**: Using Drizzle ORM with parameterized queries
- **Session Cleanup**: Automatic cleanup of expired sessions and challenges
- **Role Validation**: Server-side role validation for all operations
- **Password-less**: No passwords stored, only wallet signatures

## 🌍 Environment Variables

### Backend (`apps/api`)
```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRY=7d
CHALLENGE_EXPIRY_MINUTES=10

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/multihopper

# Server Configuration
PORT=3001
HOST=0.0.0.0
NODE_ENV=production
```

### Frontend (`apps/web`)
```bash
# API Configuration
VITE_API_URL=http://localhost:3001
VITE_TRPC_URL=http://localhost:3001/trpc

# Wallet Configuration (optional)
VITE_SOLANA_NETWORK=mainnet-beta
VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## 📝 API Reference

### tRPC Endpoints

| Endpoint | Method | Auth Required | Role | Description |
|----------|--------|---------------|------|-------------|
| `auth.challenge` | Mutation | No | - | Generate authentication challenge |
| `auth.verify` | Mutation | No | - | Verify signature and create session |
| `auth.me` | Query | Yes | Any | Get current user information |
| `auth.logout` | Mutation | Yes | Any | Logout and invalidate session |
| `auth.updateRole` | Mutation | Yes | Admin | Update user role |
| `auth.getUserSessions` | Query | Yes | Admin | Get user's active sessions |
| `auth.revokeUserSessions` | Mutation | Yes | Admin | Revoke all user sessions |
| `auth.cleanup` | Mutation | Yes | Admin | Cleanup expired data |
| `auth.health` | Query | No | - | Service health check |

### Input Schemas

```typescript
// Challenge input
type ChallengeInput = {
  publicKey: string // 32-44 character alphanumeric string
}

// Verification input
type VerifyInput = {
  publicKey: string
  nonce: string // 8-32 characters
  signature: string // Base58 encoded signature
  isHardwareWallet?: boolean // Default: false
}

// Role update input (admin only)
type UpdateRoleInput = {
  publicKey: string
  role: 'user' | 'admin'
}
```

## 🚦 Getting Started

### 1. Install Dependencies

```bash
# Backend
cd apps/api && yarn install

# Frontend  
cd apps/web && yarn install

# Shared libraries
cd libs/server && yarn install
cd libs/solana-node && yarn install
cd libs/solana-client && yarn install
```

### 2. Database Setup

```bash
# Run migrations
cd libs/server && yarn db:migrate

# Or manually create tables using the schema in auth.schema.ts
```

### 3. Configure Environment

```bash
# Backend (.env)
JWT_SECRET=your-super-secret-jwt-key
DATABASE_URL=postgresql://localhost:5432/multihopper

# Frontend (.env)
VITE_API_URL=http://localhost:3001
```

### 4. Start Services

```bash
# Start backend
cd apps/api && yarn dev

# Start frontend (in another terminal)
cd apps/web && yarn dev
```

### 5. Test Authentication

1. Open http://localhost:3000
2. Click "Connect Wallet" 
3. Approve wallet connection
4. Sign the authentication message
5. You should see authenticated user state

## 🐛 Troubleshooting

### Common Issues

**"Wallet not connected"**
- Ensure wallet extension is installed and unlocked
- Check that wallet is on the correct network
- Try refreshing the page

**"Invalid signature"**
- Ensure wallet signed the correct message
- Check for hardware wallet if using Ledger/Trezor
- Verify challenge hasn't expired

**"Authentication required"**
- Check that JWT token is being sent in Authorization header
- Verify token hasn't expired
- Try logging out and back in

**Database connection errors**
- Verify DATABASE_URL is correct
- Ensure database server is running
- Check that tables have been created

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG=trpc:*,auth:*
NODE_ENV=development
```

## 🔄 Migration Guide

If migrating from the previous class-based implementation:

1. Update imports to use individual functions instead of authService object
2. Replace `authService.method()` with `method()` function calls
3. Update any custom middleware to use the new functional API
4. Test all authentication flows thoroughly

The backward-compatible `authService` object is still exported for easier migration.

## 📈 Performance Considerations

- **Token Caching**: Tokens are cached in localStorage to avoid repeated server calls
- **Session Validation**: Sessions validated on server to prevent token forgery
- **Database Indexing**: Ensure indexes on `public_key`, `token`, and `expires_at` columns
- **Cleanup Jobs**: Run periodic cleanup to remove expired challenges and sessions

This authentication system provides enterprise-grade security while maintaining excellent developer experience through modern functional patterns and comprehensive TypeScript support.