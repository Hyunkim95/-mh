import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import routesService from '../routes/services/routes.service';
import { validateRoute } from '../routes/services/route-validation.service';

// Validation schemas
const routeHopSchema = z.object({
  recipient: z.string(),
  scheduledAt: z.string(),
});

const createRouteSchema = z.object({
  name: z.string().min(1),
  tokenType: z.enum(['SPL', 'SOL']),
  tokenMint: z.string().optional(),
  tokenSymbol: z.string().optional(),
  tokenDecimals: z.number(),
  hopAmountTokens: z.string(),
  hopAmountRaw: z.string(),
  hops: z.array(routeHopSchema),
  creator: z.string(),
});

const routeIdSchema = z.object({
  id: z.number(),
  creator: z.string(),
});

const updateRouteSchema = z.object({
  id: z.number(),
  creator: z.string(),
  updates: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    hopAmountTokens: z.string().optional(),
    hopAmountRaw: z.string().optional(),
    hops: z.array(routeHopSchema).optional(),
  }),
});

export const routesRouter = router({
  // Validate a route against token config constraints (without creating it)
  validate: publicProcedure
    .input(createRouteSchema)
    .mutation(async ({ input }) => {
      try {
        const validation = await validateRoute(input);
        return {
          success: true,
          data: {
            isValid: validation.isValid,
            errors: validation.errors
          },
          message: validation.isValid ? 'Route is valid' : 'Route validation failed'
        };
      } catch (error) {
        console.error('Error validating route:', error);
        return {
          success: false,
          data: {
            isValid: false,
            errors: ['Failed to validate route: Unable to check token configuration']
          },
          message: 'Validation error'
        };
      }
    }),

  // Create a new route (save to database)
  create: publicProcedure
    .input(createRouteSchema)
    .mutation(async ({ input }) => {
      try {
        // Validate route against token config constraints
        const validation = await validateRoute(input);
        if (!validation.isValid) {
          throw new Error(`Route validation failed: ${validation.errors.join('; ')}`);
        }

        const route = await routesService.createRoute(input);
        return {
          success: true,
          data: route,
          message: 'Route created successfully'
        };
      } catch (error) {
        console.error('Error creating route:', error);

        // Throw the original error message if it's a validation error
        if (error instanceof Error && error.message.includes('Route validation failed')) {
          throw error;
        }

        throw new Error('Failed to create route');
      }
    }),

  // Replay a route: clone it with hop deltas applied relative to now
  replay: publicProcedure
    .input(routeIdSchema)
    .mutation(async ({ input }) => {
      try {
        const cloned = await routesService.replayRoute(input.id, input.creator);
        return {
          success: true,
          data: cloned,
          message: 'Route replay created successfully',
        };
      } catch (error) {
        console.error('Error replaying route:', error);
        throw new Error(
          error instanceof Error ? error.message : 'Failed to replay route'
        );
      }
    }),

  // Get all routes for a creator
  getByCreator: publicProcedure
    .input(
    z.object({
      creator: z.string(),
      cursor: z.number().nullable().optional(),
      limit: z.number().optional().default(5),
    })
  )
    .query(async ({ input }) => {
      try {
        const { creator, cursor, limit } = input;
        const routes = await routesService.getRoutesByCreatorPaginated({ creator, cursor, limit });
        return {
          success: true,
          data: routes.data,
          nextCursor: routes.nextCursor,
        };
      } catch (error) {
        console.error('Error fetching routes:', error);
        throw new Error('Failed to fetch routes');
      }
    }),

  // Get a specific route
  getById: publicProcedure
    .input(routeIdSchema)
    .query(async ({ input }) => {
      try {
        const route = await routesService.getRoute(input.id, input.creator);
        if (!route) {
          throw new Error('Route not found');
        }
        return {
          success: true,
          data: route
        };
      } catch (error) {
        console.error('Error fetching route:', error);
        throw new Error('Failed to fetch route');
      }
    }),

  // Update a route (only if not deployed)
  update: publicProcedure
    .input(updateRouteSchema)
    .mutation(async ({ input }) => {
      try {
        // If hops are being updated, validate the entire route
        if (input.updates.hops || input.updates.hopAmountRaw) {
          // Get the existing route to build the complete updated route
          const existingRoute = await routesService.getRoute(input.id, input.creator);
          if (!existingRoute) {
            throw new Error('Route not found');
          }

          // Build the updated route for validation
          const updatedRoute = {
            tokenType: existingRoute.tokenType as 'SPL' | 'SOL',
            tokenMint: existingRoute.tokenMint || undefined,
            hopAmountRaw: input.updates.hopAmountRaw || existingRoute.hopAmountRaw,
            hops: input.updates.hops || existingRoute.hops || [],
            creator: input.creator
          };

          // Validate the updated route
          const validation = await validateRoute(updatedRoute);
          if (!validation.isValid) {
            throw new Error(`Route validation failed: ${validation.errors.join('; ')}`);
          }
        }

        const route = await routesService.updateRoute(input.id, input.creator, input.updates);
        if (!route) {
          throw new Error('Route not found or cannot be updated');
        }
        return {
          success: true,
          data: route,
          message: 'Route updated successfully'
        };
      } catch (error) {
        console.error('Error updating route:', error);

        // Throw the original error message if it's a validation error
        if (error instanceof Error && error.message.includes('Route validation failed')) {
          throw error;
        }

        throw new Error('Failed to update route');
      }
    }),

  // Delete a route (only if not deployed)
  delete: publicProcedure
    .input(routeIdSchema)
    .mutation(async ({ input }) => {
      try {
        const success = await routesService.deleteRoute(input.id, input.creator);
        if (!success) {
          throw new Error('Route not found or cannot be deleted');
        }
        return {
          success: true,
          message: 'Route deleted successfully'
        };
      } catch (error) {
        console.error('Error deleting route:', error);
        throw new Error('Failed to delete route');
      }
    }),



  // Mark route as successfully deployed (called after transaction confirmation)
  markDeployed: publicProcedure
    .input(z.object({
      id: z.number(),
      creator: z.string(),
      deploymentTxHash: z.string(),
      routeConfigPda: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        await routesService.updateRouteStatus(
          input.id,
          input.creator,
          'deployed',
          {
            deploymentTxHash: input.deploymentTxHash,
            routeConfigPda: input.routeConfigPda
          }
        );

        // Get the updated route
        const route = await routesService.getRoute(input.id, input.creator);
        if (!route) {
          throw new Error('Route not found');
        }

        return {
          success: true,
          data: route,
          message: 'Route marked as deployed successfully'
        };
      } catch (error) {
        console.error('Error marking route as deployed:', error);
        throw new Error('Failed to mark route as deployed');
      }
    }),
});
