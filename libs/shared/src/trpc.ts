import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@trpc-template/server';

// React Query integration for React components
export const trpc: ReturnType<typeof createTRPCReact<AppRouter>> = createTRPCReact<AppRouter>();
// Export the AppRouter type for type inference
export type { AppRouter } from '@trpc-template/server';
