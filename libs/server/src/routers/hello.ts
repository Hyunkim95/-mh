import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const helloRouter = router({
  greeting: publicProcedure
    .input(z.object({ name: z.string().optional() }))
    .query(({ input }) => {
      return {
        message: `Hello ${input.name || 'World'}!`,
        timestamp: new Date().toISOString(),
      };
    }),

  create: publicProcedure
    .input(z.object({ 
      title: z.string().min(1),
      content: z.string().optional()
    }))
    .mutation(({ input }) => {
      // In a real app, you'd save to a database
      return {
        id: Math.random().toString(36).substr(2, 9),
        title: input.title,
        content: input.content || '',
        createdAt: new Date().toISOString(),
      };
    }),
});
