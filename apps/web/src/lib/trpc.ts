import { createTRPCReact } from '@trpc/react-query';
import { createTRPCProxyClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import type { AppRouter } from '@trpc-template/server';

// Get auth token from localStorage (stored by jotai)
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const authTokens = localStorage.getItem('auth_tokens');
    if (authTokens) {
      const parsed = JSON.parse(authTokens);
      const token = parsed?.accessToken || null;
      // Debug log to see if token is being retrieved
      console.log('tRPC getAuthToken:', token ? `${token.substring(0, 10)}...` : 'null');
      return token;
    }
    return null;
  } catch (error) {
    console.log('tRPC getAuthToken error:', error);
    return null;
  }
}

// Create HTTP link with authentication and error handling
function createHttpLink() {
  return httpBatchLink({
    url: import.meta.env.VITE_API_URL || 'http://localhost:3001/trpc',
    headers() {
      const token = getAuthToken();
      return {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'content-type': 'application/json',
      };
    },
    fetch(url, options) {
      return fetch(url, {
        ...options,
        credentials: 'include', // Include cookies if using session-based auth
      });
    },
  });
}

// React Query integration for React components
export const trpc = createTRPCReact<AppRouter>();

// Vanilla client for non-React usage
export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [createHttpLink()],
});

// Helper function to check if error is authentication related
export function isAuthError(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    return error.data?.code === 'UNAUTHORIZED' || error.message.includes('unauthorized');
  }
  return false;
}

// Export the AppRouter type for type inference
export type { AppRouter } from '@trpc-template/server';