import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { eq } from 'drizzle-orm';
import { protectedProcedure, router } from '../trpc';
import routesService from '../routes/services/routes.service';
import { validateRoute } from '../routes/services/route-validation.service';
import {
  obfuscationService,
  intermediateWalletService,
  obfuscationTxBuilder,
} from '../obfuscation';
import { db } from '../db';
import { routesSchema } from '../db/schema';
import { createLogger } from "@libs/logger";
import { TRPCError } from "@trpc/server";

const log = createLogger("RoutesRouter");

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
});

const routeIdSchema = z.object({
  id: z.number(),
});

const updateRouteSchema = z.object({
  id: z.number(),
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
  validate: protectedProcedure
    .input(createRouteSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const creator = ctx.user.publicKey;
        const validation = await validateRoute({ ...input, creator });
        return {
          success: true,
          data: {
            isValid: validation.isValid,
            errors: validation.errors
          },
          message: validation.isValid ? 'Route is valid' : 'Route validation failed'
        };
      } catch (error) {
        log.error('Error validating route:', error);
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
  create: protectedProcedure
    .input(createRouteSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const creator = ctx.user.publicKey;
        // Validate route against token config constraints
        const validation = await validateRoute({ ...input, creator });
        if (!validation.isValid) {
          throw new Error(`Route validation failed: ${validation.errors.join('; ')}`);
        }

        const route = await routesService.createRoute({ ...input, creator });
        return {
          success: true,
          data: route,
          message: 'Route created successfully'
        };
      } catch (error) {
        log.error('Error creating route:', error);

        // Throw the original error message if it's a validation error
        if (error instanceof Error && error.message.includes('Route validation failed')) {
          throw error;
        }

        throw new Error('Failed to create route');
      }
    }),

  // Replay a route: clone it with hop deltas applied relative to now
  replay: protectedProcedure
    .input(routeIdSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const creator = ctx.user.publicKey;
        const cloned = await routesService.replayRoute(input.id, creator);
        return {
          success: true,
          data: cloned,
          message: 'Route replay created successfully',
        };
      } catch (error) {
        log.error('Error replaying route:', error);
        throw new Error(
          error instanceof Error ? error.message : 'Failed to replay route'
        );
      }
    }),

  // Get all routes for a creator
  getByCreator: protectedProcedure
    .input(
    z.object({
      cursor: z.number().nullable().optional(),
      limit: z.number().optional().default(5),
    })
  )
    .query(async ({ ctx, input }) => {
      try {
        const creator = ctx.user.publicKey;
        const { cursor, limit } = input;
        const routes = await routesService.getRoutesByCreatorPaginated({ creator, cursor, limit });
        return {
          success: true,
          data: routes.data,
          nextCursor: routes.nextCursor,
        };
      } catch (error) {
        log.error('Error fetching routes:', error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new Error('Failed to fetch routes');
      }
    }),

  // Get a specific route
  getById: protectedProcedure
    .input(routeIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        const creator = ctx.user.publicKey;
        const route = await routesService.getRoute(input.id, creator);
        if (!route) {
          throw new Error('Route not found');
        }
        return {
          success: true,
          data: route
        };
      } catch (error) {
        log.error('Error fetching route:', error);
        throw new Error('Failed to fetch route');
      }
    }),

  // Update a route (only if not deployed)
  update: protectedProcedure
    .input(updateRouteSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const creator = ctx.user.publicKey;
        // If hops are being updated, validate the entire route
        if (input.updates.hops || input.updates.hopAmountRaw) {
          // Get the existing route to build the complete updated route
          const existingRoute = await routesService.getRoute(input.id, creator);
          if (!existingRoute) {
            throw new Error('Route not found');
          }

          // Build the updated route for validation
          const updatedRoute = {
            tokenType: existingRoute.tokenType as 'SPL' | 'SOL',
            tokenMint: existingRoute.tokenMint || undefined,
            hopAmountRaw: input.updates.hopAmountRaw || existingRoute.hopAmountRaw,
            hops: input.updates.hops || existingRoute.hops || [],
            creator
          };

          // Validate the updated route
          const validation = await validateRoute(updatedRoute);
          if (!validation.isValid) {
            throw new Error(`Route validation failed: ${validation.errors.join('; ')}`);
          }
        }

        const route = await routesService.updateRoute(input.id, creator, input.updates);
        if (!route) {
          throw new Error('Route not found or cannot be updated');
        }
        return {
          success: true,
          data: route,
          message: 'Route updated successfully'
        };
      } catch (error) {
        log.error('Error updating route:', error);

        // Throw the original error message if it's a validation error
        if (error instanceof Error && error.message.includes('Route validation failed')) {
          throw error;
        }

        throw new Error('Failed to update route');
      }
    }),

  // Delete a route (only if not deployed)
  delete: protectedProcedure
    .input(routeIdSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const creator = ctx.user.publicKey;
        const success = await routesService.deleteRoute(input.id, creator);
        if (!success) {
          throw new Error('Route not found or cannot be deleted');
        }
        return {
          success: true,
          message: 'Route deleted successfully'
        };
      } catch (error) {
        log.error('Error deleting route:', error);
        throw new Error('Failed to delete route');
      }
    }),



  // Update hop timestamps in database (for fixing incomplete deployments)
  updateHopTimestamps: protectedProcedure
    .input(z.object({
      routeId: z.number(),
      hops: z.array(z.object({
        recipient: z.string(),
        scheduledAt: z.number(), // Unix timestamp in milliseconds
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const creator = ctx.user.publicKey;
        await routesService.updateHopTimestamps(
          input.routeId,
          creator,
          input.hops
        );

        return {
          success: true,
          message: 'Hop timestamps updated successfully'
        };
      } catch (error) {
        log.error('Error updating hop timestamps:', error);
        throw new Error('Failed to update hop timestamps');
      }
    }),

  // Mark route as successfully deployed (called after transaction confirmation)
  markDeployed: protectedProcedure
    .input(z.object({
      id: z.number(),
      deploymentTxHash: z.string(),
      routeConfigPda: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const creator = ctx.user.publicKey;
        await routesService.updateRouteStatus(
          input.id,
          creator,
          'deployed',
          {
            deploymentTxHash: input.deploymentTxHash,
            routeConfigPda: input.routeConfigPda
          }
        );

        // Get the updated route
        const route = await routesService.getRoute(input.id, creator);
        if (!route) {
          throw new Error('Route not found');
        }

        return {
          success: true,
          data: route,
          message: 'Route marked as deployed successfully'
        };
      } catch (error) {
        log.error('Error marking route as deployed:', error);
        throw new Error('Failed to mark route as deployed');
      }
    }),

  // ==================== OBFUSCATION ENDPOINTS ====================

  // Get obfuscation session for a route
  getObfuscationSession: protectedProcedure
    .input(z.object({
      routeId: z.number(),
    }))
    .query(async ({ input }) => {
      try {
        const session = await obfuscationService.getSessionByRouteId(input.routeId);
        if (!session) {
          return {
            success: false,
            data: null,
            message: 'No obfuscation session found for this route'
          };
        }

        // Get session with wallet details
        const sessionWithWallets = await obfuscationService.getSessionWithWallets(session.id);

        return {
          success: true,
          data: sessionWithWallets,
        };
      } catch (error) {
        log.error('Error fetching obfuscation session:', error);
        throw new Error('Failed to fetch obfuscation session');
      }
    }),

  // Get obfuscation cost estimate for a route
  getObfuscationCostEstimate: protectedProcedure
    .input(z.object({
      routeId: z.number(),
    }))
    .query(async ({ input }) => {
      try {
        const session = await obfuscationService.getSessionByRouteId(input.routeId);
        if (!session) {
          return {
            success: false,
            data: null,
            message: 'No obfuscation session found for this route'
          };
        }

        // Fetch route with hops to get hopCount and amount
        const route = await db.query.routesSchema.findFirst({
          where: eq(routesSchema.id, input.routeId),
          with: { hops: true },
        });

        if (!route) {
          return {
            success: false,
            data: null,
            message: 'Route not found'
          };
        }

        const hopCount = route.hops?.length ?? 0;
        const amountLamports = BigInt(route.hopAmountRaw);

        // Calculate fee estimate
        const feeEstimate = await obfuscationService.estimateObfuscationFees(
          session.intermediateCount,
          session.tokenType as 'SOL' | 'SPL',
          hopCount,
          Number(amountLamports)
        );

        // Convert lamports to SOL for display
        const lamportsToSol = (lamports: number) => (lamports / 1_000_000_000).toFixed(6);

        return {
          success: true,
          data: {
            ...feeEstimate,
            intermediateCount: session.intermediateCount,
            tokenType: session.tokenType,
            breakdown: {
              transactionFeesSOL: lamportsToSol(feeEstimate.fundingTxFees + feeEstimate.aggregationTxFees + feeEstimate.cleanupTxFees),
              accountDepositsSOL: lamportsToSol(feeEstimate.intermediateAtaCreation + feeEstimate.walletXAtaCreation),
              refundableSOL: lamportsToSol(feeEstimate.rentRecovery),
              dustRefundSOL: lamportsToSol(feeEstimate.dustRefund),
              netCostSOL: lamportsToSol(feeEstimate.totalFeesLamports),
            },
          },
        };
      } catch (error) {
        throw new Error('Failed to fetch obfuscation cost estimate');
      }
    }),

  // Get funding transactions for obfuscated route (for batch signing)
  getObfuscationFundingTransactions: protectedProcedure
    .input(z.object({
      routeId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const creator = ctx.user.publicKey;
        // Get the obfuscation session
        const session = await obfuscationService.getSessionByRouteId(input.routeId);
        if (!session) {
          throw new Error('No obfuscation session found for this route');
        }

        // Fetch route with hops to get hopCount and amount
        const route = await db.query.routesSchema.findFirst({
          where: eq(routesSchema.id, input.routeId),
          with: { hops: true },
        });

        if (!route) {
          throw new Error('Route not found');
        }

        const hopCount = route.hops?.length ?? 0;
        const amountLamports = BigInt(route.hopAmountRaw);

        // Build all funding transactions
        const sourceWallet = new PublicKey(creator);
        const transactions = await obfuscationTxBuilder.buildAllFundingTransactions(
          session.id,
          sourceWallet
        );

        // Update session status to funding
        await obfuscationService.updateSessionStatus(session.id, 'funding');

        // Get fee estimate
        const feeEstimate = await obfuscationService.estimateObfuscationFees(
          session.intermediateCount,
          session.tokenType as 'SOL' | 'SPL',
          hopCount,
          Number(amountLamports)
        );

        return {
          success: true,
          data: {
            sessionId: session.id,
            transactions, // Array of { walletIndex, serialized, destinationAddress, amount }
            feeEstimate,
            totalTransactions: transactions.length,
          },
        };
      } catch (error) {
        log.error('Error building funding transactions:', error);
        throw new Error(
          error instanceof Error ? error.message : 'Failed to build funding transactions'
        );
      }
    }),

  // Confirm funding for an intermediate wallet
  confirmObfuscationFunding: protectedProcedure
    .input(z.object({
      routeId: z.number(),
      walletIndex: z.number(),
      txHash: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        const session = await obfuscationService.getSessionByRouteId(input.routeId);
        if (!session) {
          throw new Error('No obfuscation session found');
        }

        // Update wallet funding status
        await intermediateWalletService.updateFundingStatusByIndex(
          session.id,
          input.walletIndex,
          'funded',
          input.txHash
        );

        // Check if all wallets are now funded
        const allFunded = await intermediateWalletService.areAllWalletsFunded(session.id);

        if (allFunded) {
          // Schedule aggregations with random delays
          await obfuscationService.scheduleAggregations(session.id);
        }

        return {
          success: true,
          data: {
            allFunded,
            sessionId: session.id,
          },
          message: allFunded
            ? 'All wallets funded, aggregation scheduled'
            : 'Funding confirmed',
        };
      } catch (error) {
        log.error('Error confirming funding:', error);
        throw new Error('Failed to confirm funding');
      }
    }),

  // Batch confirm all funding transactions
  confirmAllObfuscationFunding: protectedProcedure
    .input(z.object({
      routeId: z.number(),
      fundingResults: z.array(z.object({
        walletIndex: z.number(),
        txHash: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      try {
        const session = await obfuscationService.getSessionByRouteId(input.routeId);
        if (!session) {
          throw new Error('No obfuscation session found');
        }

        // Update all wallet funding statuses
        for (const result of input.fundingResults) {
          await intermediateWalletService.updateFundingStatusByIndex(
            session.id,
            result.walletIndex,
            'funded',
            result.txHash
          );
        }

        // Check if all wallets are now funded
        const allFunded = await intermediateWalletService.areAllWalletsFunded(session.id);

        if (allFunded) {
          // Schedule aggregations with random delays
          await obfuscationService.scheduleAggregations(session.id);
        }

        return {
          success: true,
          data: {
            allFunded,
            sessionId: session.id,
            confirmedCount: input.fundingResults.length,
          },
          message: allFunded
            ? 'All wallets funded, aggregation scheduled'
            : `Confirmed ${input.fundingResults.length} funding transactions`,
        };
      } catch (error) {
        log.error('Error confirming funding:', error);
        throw new Error('Failed to confirm funding');
      }
    }),

  // Get obfuscation status for a route
  getObfuscationStatus: protectedProcedure
    .input(z.object({
      routeId: z.number(),
    }))
    .query(async ({ input }) => {
      try {
        const session = await obfuscationService.getSessionByRouteId(input.routeId);
        if (!session) {
          return {
            success: false,
            data: null,
            message: 'No obfuscation session found',
          };
        }

        const intermediateWallets = await obfuscationService.getIntermediateWallets(session.id);
        const fundedCount = intermediateWallets.filter(w => w.fundingStatus === 'funded').length;
        const aggregatedCount = intermediateWallets.filter(w => w.aggregationStatus === 'confirmed').length;
        const cleanedUpCount = intermediateWallets.filter(w => w.cleanupStatus === 'completed').length;

        return {
          success: true,
          data: {
            sessionId: session.id,
            status: session.status,
            intermediateCount: session.intermediateCount,
            fundedCount,
            aggregatedCount,
            cleanedUpCount,
            isReady: session.status === 'completed',
          },
        };
      } catch (error) {
        log.error('Error fetching obfuscation status:', error);
        throw new Error('Failed to fetch obfuscation status');
      }
    }),
});
