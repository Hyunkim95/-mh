import { createTRPCReact } from "@trpc/react-query";
import type { CreateTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient } from "@tanstack/react-query";
import type { AppRouter } from "@trpc-template/server";

export const trpc: CreateTRPCReact<AppRouter, any, any> = createTRPCReact<AppRouter>();
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Don't retry on 401 (unauthorized) errors
        if (error?.data?.httpStatus === 401 || error?.message === 'UNAUTHORIZED') {
          return false;
        }
        // Default: retry up to 3 times for other errors
        return failureCount < 3;
      },
      onError: (error: any) => {
        console.error(error);
      },
    },
    mutations: {
      onError: (error: any) => {
        console.error(error);
      },
    },
  },
});

// Create HTTP link with authentication and error handling
function createHttpLink() {
  return httpBatchLink({
    url: import.meta.env.VITE_API_URL || "http://localhost:3001/trpc",
    headers() {
      const token = localStorage.getItem("token");
      return {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
      };
    },
    fetch(url, options) {
      return fetch(url, {
        ...options,
        credentials: "include", // Include cookies if using session-based auth
      });
    },
  });
}

export const trpcClient = trpc.createClient({
  links: [createHttpLink()],
});
