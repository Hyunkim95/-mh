import jwt from 'jsonwebtoken';
import { eq, and, gt, sql } from 'drizzle-orm';
import { db } from '../../db';
import { 
  usersSchema, 
  sessionsSchema, 
  authChallengesSchema,
  User, 
  Session
} from '../schema/auth.schema';
import { createChallenge, verifySignature } from '@libs/solana-node';

export interface AuthContext {
  user: User | null;
  session: Session | null;
}

export interface JWTPayload {
  userId: number;
  sessionId: number;
  publicKey: string;
  role: string;
}

// Configuration
const getConfig = () => ({
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '7d',
  CHALLENGE_EXPIRY_MINUTES: parseInt(process.env.CHALLENGE_EXPIRY_MINUTES || '10'),
});

// Validate configuration
const validateConfig = () => {
  const config = getConfig();
  if (process.env.NODE_ENV === 'production' && config.JWT_SECRET === 'your-super-secret-jwt-key-change-in-production') {
    throw new Error('JWT_SECRET must be set in production environment');
  }
  return config;
};

// Initialize and validate config on module load
const config = validateConfig();

/**
 * Generate JWT token
 */
const generateJWT = (payload: JWTPayload): string => {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRY } as jwt.SignOptions);
};

/**
 * Generate authentication challenge for a wallet
 */
export const generateAuthChallenge = async (publicKey: string): Promise<{ nonce: string; message: string }> => {
  const { nonce, message } = createChallenge();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + config.CHALLENGE_EXPIRY_MINUTES);

  // Clean up old challenges for this public key
  await db.delete(authChallengesSchema)
    .where(eq(authChallengesSchema.publicKey, publicKey));

  // Store the challenge
  await db.insert(authChallengesSchema).values({
    publicKey,
    nonce,
    message,
    expiresAt,
  });

  return { nonce, message };
};

/**
 * Verify wallet signature and create session
 */
export const verifySignatureAndCreateSession = async (
  publicKey: string, 
  nonce: string, 
  signature: string, 
  isHardwareWallet: boolean = false
): Promise<{ user: User; session: Session; token: string }> => {
  // Find and validate the challenge
  const challenge = await db.query.authChallengesSchema.findFirst({
    where: and(
      eq(authChallengesSchema.publicKey, publicKey),
      eq(authChallengesSchema.nonce, nonce),
      gt(authChallengesSchema.expiresAt, new Date()),
      sql`${authChallengesSchema.used} IS NULL`
    ),
  });

  if (!challenge) {
    throw new Error('Invalid or expired challenge');
  }

  // Verify the signature
  const isValid = await verifySignature(publicKey, nonce, signature, isHardwareWallet);
  if (!isValid) {
    throw new Error('Invalid signature');
  }

  // Mark challenge as used
  await db.update(authChallengesSchema)
    .set({ used: new Date() })
    .where(eq(authChallengesSchema.id, challenge.id));

  // Find or create user
  let user = await db.query.usersSchema.findFirst({
    where: eq(usersSchema.publicKey, publicKey),
  });

  if (!user) {
    const [newUser] = await db.insert(usersSchema)
      .values({
        publicKey,
        role: 'user', // Default role
      })
      .returning();
    user = newUser;
  }

  // Create session
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days by default

  const token = generateJWT({
    userId: user.id,
    sessionId: 0, // Will be updated after session creation
    publicKey: user.publicKey,
    role: user.role,
  });

  const [session] = await db.insert(sessionsSchema)
    .values({
      userId: user.id,
      token,
      expiresAt,
    })
    .returning();

  // Update the JWT with the actual session ID
  const finalToken = generateJWT({
    userId: user.id,
    sessionId: session.id,
    publicKey: user.publicKey,
    role: user.role,
  });

  // Update the session with the final token
  await db.update(sessionsSchema)
    .set({ token: finalToken })
    .where(eq(sessionsSchema.id, session.id));

  const finalSession = { ...session, token: finalToken };

  return { user, session: finalSession, token: finalToken };
};

/**
 * Verify JWT token and return user context
 */
export const verifyAuthToken = async (token: string): Promise<AuthContext> => {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
    
    // Verify session exists and is not expired
    const session = await db.query.sessionsSchema.findFirst({
      where: and(
        eq(sessionsSchema.id, payload.sessionId),
        eq(sessionsSchema.token, token),
        gt(sessionsSchema.expiresAt, new Date())
      ),
    });

    if (!session) {
      return { user: null, session: null };
    }

    // Get user data
    const user = await db.query.usersSchema.findFirst({
      where: eq(usersSchema.id, payload.userId),
    });

    if (!user) {
      return { user: null, session: null };
    }

    return { user, session };
  } catch (error) {
    return { user: null, session: null };
  }
};

/**
 * Logout user by invalidating session
 */
export const logoutUser = async (token: string): Promise<boolean> => {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
    
    const result = await db.delete(sessionsSchema)
      .where(and(
        eq(sessionsSchema.id, payload.sessionId),
        eq(sessionsSchema.token, token)
      ));

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    return false;
  }
};

/**
 * Update user role (admin only operation)
 */
export const updateUserRole = async (publicKey: string, newRole: 'user' | 'admin'): Promise<User | null> => {
  const [user] = await db.update(usersSchema)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(usersSchema.publicKey, publicKey))
    .returning();

  return user || null;
};

/**
 * Clean up expired sessions and challenges
 */
export const cleanupExpiredSessions = async (): Promise<void> => {
  const now = new Date();
  
  // Clean up expired sessions
  await db.delete(sessionsSchema)
    .where(sql`${sessionsSchema.expiresAt} < ${now}`);
  
  // Clean up expired challenges
  await db.delete(authChallengesSchema)
    .where(sql`${authChallengesSchema.expiresAt} < ${now}`);
};

/**
 * Get all active sessions for a user (admin function)
 */
export const getUserSessions = async (userId: number): Promise<Session[]> => {
  return await db.query.sessionsSchema.findMany({
    where: and(
      eq(sessionsSchema.userId, userId),
      gt(sessionsSchema.expiresAt, new Date())
    ),
  });
};

/**
 * Revoke all sessions for a user
 */
export const revokeAllUserSessions = async (userId: number): Promise<number> => {
  const result = await db.delete(sessionsSchema)
    .where(eq(sessionsSchema.userId, userId));
  
  return result.rowCount ?? 0;
};

/**
 * Get user by public key
 */
export const getUserByPublicKey = async (publicKey: string): Promise<User | null> => {
  const user = await db.query.usersSchema.findFirst({
    where: eq(usersSchema.publicKey, publicKey),
  });
  
  return user || null;
};

/**
 * Get user by ID
 */
export const getUserById = async (id: number): Promise<User | null> => {
  const user = await db.query.usersSchema.findFirst({
    where: eq(usersSchema.id, id),
  });
  
  return user || null;
};

/**
 * Create a new user
 */
export const createUser = async (publicKey: string, role: 'user' | 'admin' = 'user'): Promise<User> => {
  const [user] = await db.insert(usersSchema)
    .values({
      publicKey,
      role,
    })
    .returning();

  return user;
};

/**
 * Check if user has admin role
 */
export const isAdmin = (user: User | null): boolean => {
  return user?.role === 'admin';
};

/**
 * Check if user has specific role
 */
export const hasRole = (user: User | null, role: 'user' | 'admin'): boolean => {
  return user?.role === role;
};

/**
 * Extract token from Authorization header
 */
export const extractTokenFromHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7); // Remove 'Bearer ' prefix
};

// Export auth service object for backward compatibility
export const authService = {
  generateChallenge: generateAuthChallenge,
  verifyAndCreateSession: verifySignatureAndCreateSession,
  verifyToken: verifyAuthToken,
  logout: logoutUser,
  updateUserRole,
  cleanupExpired: cleanupExpiredSessions,
  getUserSessions,
  revokeAllUserSessions,
  getUserByPublicKey,
  getUserById,
  createUser,
  isAdmin,
  hasRole,
  extractTokenFromHeader,
};