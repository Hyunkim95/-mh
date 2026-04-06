import { createTRPCReact } from "@trpc/react-query";
import type { CreateTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient } from "@tanstack/react-query";
import type { AppRouter } from "@trpc-template/server";
import { captureClientError } from "./utils/monitoring";
import {
  clearStoredAuthToken,
  getStoredAuthToken,
} from "./utils/authToken";

export const trpc: CreateTRPCReact<AppRouter, any, any> = createTRPCReact<AppRouter>();

function isUnauthorizedError(error: any) {
  const message = String(error?.message ?? "").toUpperCase();
  const code = String(error?.data?.code ?? "").toUpperCase();

  return (
    error?.data?.httpStatus === 401 ||
    message === "UNAUTHORIZED" ||
    message.includes("TOKEN SIGNATURE IS INVALID") ||
    code === "UNAUTHORIZED"
  );
}

function isAuthQueryKey(queryKey: readonly unknown[]) {
  return JSON.stringify(queryKey).includes("auth");
}

function resetUnauthorizedClientState() {
  clearStoredAuthToken();
  void queryClient.cancelQueries();
  queryClient.removeQueries({
    predicate: (query) => isAuthQueryKey(query.queryKey),
  });

  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Don't retry on 401 (unauthorized) errors
        if (isUnauthorizedError(error)) {
          return false;
        }
        // Default: retry up to 3 times for other errors
        return failureCount < 3;
      },
      onError: (error: any) => {
        if (isUnauthorizedError(error)) {
          resetUnauthorizedClientState();
        }

        captureClientError(error, {
          area: "trpc",
          action: "query",
          extra: {
            httpStatus: error?.data?.httpStatus,
            code: error?.data?.code ?? error?.message,
          },
        });
      },
    },
    mutations: {
      onError: (error: any) => {
        if (isUnauthorizedError(error)) {
          resetUnauthorizedClientState();
        }

        captureClientError(error, {
          area: "trpc",
          action: "mutation",
          extra: {
            httpStatus: error?.data?.httpStatus,
            code: error?.data?.code ?? error?.message,
          },
        });
      },
    },
  },
});

// Create HTTP link with authentication and error handling
function createHttpLink() {
  return httpBatchLink({
    url: import.meta.env.VITE_API_URL || "/trpc",
    headers() {
      const token = getStoredAuthToken();
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
