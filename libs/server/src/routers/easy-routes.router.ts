import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { createEasyRouteService } from '../routes/services/easy-route.service';
import { db } from '../db';

// Validation schema for Easy Route input
const easyRouteSchema = z.object({
  arrivalTime: z.string().transform((str) => new Date(str)),
  hopCount: z.number().min(1),
  destinationWallet: z.string().min(32).max(64), // Solana address length
  tokenType: z.enum(['SPL', 'SOL']),
  tokenMint: z.string().optional(),
  tokenSymbol: z.string().optional(),
  tokenDecimals: z.number().default(6),
  hopAmountTokens: z.string(),
  hopAmountRaw: z.string(),
  creator: z.string(),
});

export const easyRoutesRouter = router({
  // Create an Easy Route
  create: publicProcedure
    .input(easyRouteSchema)
    .mutation(async ({ input }) => {
      try {
        const easyRouteService = createEasyRouteService(db);

        // Validate the input first
        const validation = await easyRouteService.validateEasyRouteInput(input);
        if (!validation.isValid) {
          throw new Error(`Easy Route validation failed: ${validation.errors.join('; ')}`);
        }

        // Create the Easy Route
        const route = await easyRouteService.createEasyRoute(input);

        return {
          success: true,
          data: route,
          message: 'Easy Route created successfully'
        };
      } catch (error) {
        console.error('Error creating Easy Route:', error);
        throw new Error(
          error instanceof Error ? error.message : 'Failed to create Easy Route'
        );
      }
    }),

  // Validate Easy Route input without creating it
  validate: publicProcedure
    .input(easyRouteSchema.omit({ creator: true }))
    .mutation(async ({ input }) => {
      try {
        const easyRouteService = createEasyRouteService(db);
        const validation = await easyRouteService.validateEasyRouteInput(input);

        return {
          success: true,
          data: {
            isValid: validation.isValid,
            errors: validation.errors
          },
          message: validation.isValid ? 'Easy Route is valid' : 'Easy Route validation failed'
        };
      } catch (error) {
        console.error('Error validating Easy Route:', error);
        return {
          success: false,
          data: {
            isValid: false,
            errors: ['Failed to validate Easy Route']
          },
          message: 'Validation error'
        };
      }
    }),
});