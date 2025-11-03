import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import type { CreateTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@trpc-template/server";
import { QueryClient } from "@tanstack/react-query";

export const trpc = createTRPCReact<AppRouter>() as CreateTRPCReact<
  AppRouter,
  any,
  any
>;
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
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
