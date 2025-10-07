import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import type { CreateTRPCReact } from "@trpc/react-query";
import { AppRouter } from "@trpc-template/server";
import { QueryClient } from "@tanstack/react-query";

export const trpc = createTRPCReact<AppRouter>() as CreateTRPCReact<
  AppRouter,
  any,
  any
>;
export const queryClient = new QueryClient();

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "http://localhost:3001/trpc",
      headers() {
        const token = localStorage.getItem("token");
        return token
          ? {
              authorization: `Bearer ${token}`,
            }
          : {};
      },
    }),
  ],
});
