/**
 * Solana Authentication System Usage Examples
 * 
 * This file demonstrates how to use the Solana-based authentication system
 * for both REST API endpoints and tRPC procedures.
 */

import { authService } from './services/auth.service';
import { publicProcedure, protectedProcedure, adminProcedure } from '../trpc';
import { z } from 'zod';

// ===== REST API Usage Examples =====

/**
 * Example 1: Generate Challenge (REST API)
 * 
 * POST /auth/challenge
 * Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "publicKey": "11111111111111111111111111111112"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "nonce": "AbCdEf123456",
 *     "message": "Welcome to the application. Sign this message to prove you own this address: AbCdEf123456"
 *   }
 * }
 */

/**
 * Example 2: Verify Signature (REST API)
 * 
 * POST /auth/verify
 * Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "publicKey": "11111111111111111111111111111112",
 *   "nonce": "AbCdEf123456",
 *   "signature": "base58-encoded-signature...",
 *   "isHardwareWallet": false
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "user": {
 *       "id": 1,
 *       "publicKey": "11111111111111111111111111111112",
 *       "role": "user",
 *       "createdAt": "2024-01-01T00:00:00.000Z",
 *       "updatedAt": "2024-01-01T00:00:00.000Z"
 *     },
 *     "session": {
 *       "id": 1,
 *       "expiresAt": "2024-01-08T00:00:00.000Z",
 *       "createdAt": "2024-01-01T00:00:00.000Z"
 *     },
 *     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *   }
 * }
 */

/**
 * Example 3: Get User Info (REST API)
 * 
 * GET /auth/me
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "user": {
 *       "id": 1,
 *       "publicKey": "11111111111111111111111111111112",
 *       "role": "user",
 *       "createdAt": "2024-01-01T00:00:00.000Z",
 *       "updatedAt": "2024-01-01T00:00:00.000Z"
 *     },
 *     "session": {
 *       "id": 1,
 *       "expiresAt": "2024-01-08T00:00:00.000Z",
 *       "createdAt": "2024-01-01T00:00:00.000Z"
 *     }
 *   }
 * }
 */

/**
 * Example 4: Logout (REST API)
 * 
 * POST /auth/logout
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Successfully logged out"
 * }
 */

// ===== tRPC Usage Examples =====

/**
 * Example: Using tRPC procedures with different permission levels
 */

// Public procedure - no authentication required
const publicExample = publicProcedure
  .input(z.object({ message: z.string() }))
  .query(({ input }) => {
    return { message: `Hello ${input.message}` };
  });

// Protected procedure - requires authentication
const protectedExample = protectedProcedure
  .input(z.object({ data: z.string() }))
  .mutation(({ input, ctx }) => {
    // ctx.user and ctx.session are guaranteed to exist
    return {
      message: `Hello ${ctx.user.publicKey}, you said: ${input.data}`,
      userId: ctx.user.id,
      role: ctx.user.role,
    };
  });

// Admin procedure - requires admin role
const adminExample = adminProcedure
  .input(z.object({ action: z.string() }))
  .mutation(({ input, ctx }) => {
    // ctx.user is guaranteed to be an admin
    return {
      message: `Admin ${ctx.user.publicKey} executed: ${input.action}`,
      adminId: ctx.user.id,
    };
  });

// ===== Direct Service Usage Examples =====

/**
 * Example: Using the authentication service directly
 */
export async function directServiceExamples() {
  const publicKey = '11111111111111111111111111111112';
  
  try {
    // Generate challenge
    const challenge = await authService.generateChallenge(publicKey);
    console.log('Challenge:', challenge);
    
    // Simulate signature verification (replace with actual signature)
    const result = await authService.verifyAndCreateSession(
      publicKey,
      challenge.nonce,
      'your-signature-here',
      false
    );
    console.log('Authentication result:', result);
    
    // Verify token
    const authContext = await authService.verifyToken(result.token);
    console.log('Token verification:', authContext);
    
    // Update user role (admin operation)
    const updatedUser = await authService.updateUserRole(publicKey, 'admin');
    console.log('Updated user:', updatedUser);
    
    // Logout
    const logoutSuccess = await authService.logout(result.token);
    console.log('Logout success:', logoutSuccess);
    
  } catch (error) {
    console.error('Authentication error:', error);
  }
}

// ===== Frontend Integration Examples =====

/**
 * Example: Frontend JavaScript code for wallet authentication
 */
export const frontendExamples = {
  // Step 1: Request challenge
  requestChallenge: async (publicKey: string) => {
    const response = await fetch('/auth/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey }),
    });
    return response.json();
  },

  // Step 2: Sign message with wallet (using Phantom wallet as example)
  signMessage: async (message: string) => {
    // This would be called from your frontend with a connected wallet
    if (typeof window !== 'undefined' && window.solana) {
      const encodedMessage = new TextEncoder().encode(message);
      const signedMessage = await window.solana.signMessage(encodedMessage);
      return signedMessage;
    }
    throw new Error('Wallet not connected');
  },

  // Step 3: Verify signature
  verifySignature: async (publicKey: string, nonce: string, signature: string) => {
    const response = await fetch('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey,
        nonce,
        signature,
        isHardwareWallet: false,
      }),
    });
    return response.json();
  },

  // Step 4: Use authenticated endpoints
  getMe: async (token: string) => {
    const response = await fetch('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  },

  logout: async (token: string) => {
    const response = await fetch('/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  },
};

// ===== Environment Variables Required =====
/**
 * Required Environment Variables:
 * 
 * JWT_SECRET=your-super-secret-jwt-key-change-in-production
 * JWT_EXPIRY=7d
 * CHALLENGE_EXPIRY_MINUTES=10
 * DATABASE_URL=postgresql://user:password@localhost:5432/dbname
 * 
 * Optional:
 * NODE_ENV=production
 */

// ===== Database Schema =====
/**
 * The authentication system creates these tables:
 * 
 * 1. users - Store user information
 *    - id: Primary key
 *    - public_key: Solana wallet address (unique)
 *    - role: 'user' or 'admin'
 *    - created_at: Timestamp
 *    - updated_at: Timestamp
 * 
 * 2. sessions - Store active sessions
 *    - id: Primary key
 *    - user_id: Foreign key to users
 *    - token: JWT token (unique)
 *    - expires_at: Session expiration
 *    - created_at: Timestamp
 *    - updated_at: Timestamp
 * 
 * 3. auth_challenges - Store authentication challenges
 *    - id: Primary key
 *    - public_key: Wallet address
 *    - nonce: Random challenge string
 *    - message: Full challenge message
 *    - expires_at: Challenge expiration (default 10 minutes)
 *    - created_at: Timestamp
 *    - used: Timestamp when challenge was used
 */