import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WalletProvider } from '@libs/solana-client'
import { trpc } from './lib/trpc'
import { httpBatchLink } from '@trpc/client'
import { AuthProvider } from './providers/AuthProvider'
import App from './App.tsx'
import './index.css'

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error: any) => {
        // Don't retry on auth errors
        if (error?.data?.code === 'UNAUTHORIZED') {
          return false;
        }
        return failureCount < 3;
      },
    },
  },
})

// Create tRPC client
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: import.meta.env.VITE_API_URL || 'http://localhost:3001/trpc',
      headers() {
        let token: string | null = null;
        try {
          const authTokens = localStorage.getItem('auth_tokens');
          if (authTokens) {
            const parsed = JSON.parse(authTokens);
            token = parsed?.accessToken || null;
          }
        } catch {
          token = null;
        }
        console.log('tRPC headers token:', token ? `${token.substring(0, 10)}...` : 'null');
        return {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          'content-type': 'application/json',
        };
      },
      fetch(url: URL | RequestInfo, options: any) {
        return fetch(url, {
          ...options,
          credentials: 'include',
        });
      },
    })
  ],
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <WalletProvider 
          network={'devnet' as any}
          endpoint={'https://mainnet.helius-rpc.com/?api-key=f6d0c03a-562f-4784-8b78-ebb084b72514'}
        >
          <AuthProvider>
            <App />
          </AuthProvider>
        </WalletProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </React.StrictMode>,
)