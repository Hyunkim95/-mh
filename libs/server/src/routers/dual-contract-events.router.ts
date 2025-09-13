import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';
import dualDirectionContractEventsService from '../solana/dual-direction-contract-events.service';

export const dualContractEventsRouter = router({
  // Get the current status of both forward and backward schedulers
  getStatus: publicProcedure
    .query(async () => {
      try {
        return await dualDirectionContractEventsService.getStatus();
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get dual direction contract events status',
          cause: error,
        });
      }
    }),

  // Manually trigger ETL job for both directions
  runEtlNow: publicProcedure
    .input(z.object({
      direction: z.enum(['forward', 'backward', 'both']).optional().default('both'),
    }))
    .mutation(async ({ input }) => {
      try {
        if (input.direction === 'both') {
          const result = await dualDirectionContractEventsService.runEtlNow();
          return {
            success: true,
            message: 'ETL jobs completed for both directions',
            result,
          };
        }

        // Run specific direction
        const scheduler = input.direction === 'forward' 
          ? dualDirectionContractEventsService.getForwardScheduler()
          : dualDirectionContractEventsService.getBackwardScheduler();
          
        const result = await scheduler.runEtlNow();
        return {
          success: true,
          message: `ETL job completed for ${input.direction} direction`,
          result,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to run ETL job',
          cause: error,
        });
      }
    }),

  // Manually process events for both directions
  processEventsNow: publicProcedure
    .input(z.object({
      direction: z.enum(['forward', 'backward', 'both']).optional().default('both'),
    }))
    .mutation(async ({ input }) => {
      try {
        if (input.direction === 'both') {
          const result = await dualDirectionContractEventsService.processEventsNow();
          return {
            success: true,
            message: 'Event processing completed for both directions',
            result,
          };
        }

        // Process specific direction
        const scheduler = input.direction === 'forward' 
          ? dualDirectionContractEventsService.getForwardScheduler()
          : dualDirectionContractEventsService.getBackwardScheduler();
          
        const result = await scheduler.processEventsNow();
        return {
          success: true,
          message: `Event processing completed for ${input.direction} direction`,
          result,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process events',
          cause: error,
        });
      }
    }),

  // Update configuration for both directions
  updateConfig: publicProcedure
    .input(z.object({
      forwardConfig: z.object({
        etlIntervalMs: z.number(),
        processingIntervalMs: z.number().optional(),
        enabled: z.boolean().optional(),
      }).optional(),
      backwardConfig: z.object({
        etlIntervalMs: z.number(),
        processingIntervalMs: z.number().optional(),
        enabled: z.boolean().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        dualDirectionContractEventsService.updateConfig(input);
        return {
          success: true,
          message: 'Configuration updated successfully',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update configuration',
          cause: error,
        });
      }
    }),

  // Get processing statistics for both directions
  getProcessingStats: publicProcedure
    .query(async () => {
      try {
        const forwardScheduler = dualDirectionContractEventsService.getForwardScheduler();
        const backwardScheduler = dualDirectionContractEventsService.getBackwardScheduler();
        
        const [forwardStats, backwardStats] = await Promise.all([
          forwardScheduler.getEventProcessor().getProcessingStats(),
          backwardScheduler.getEventProcessor().getProcessingStats(),
        ]);

        return {
          forward: {
            ...forwardStats,
            direction: 'forward',
            description: 'Real-time processing of newest transactions',
          },
          backward: {
            ...backwardStats,
            direction: 'backward', 
            description: 'Historical processing of oldest transactions',
          },
          combined: {
            totalEvents: forwardStats.totalEvents + backwardStats.totalEvents,
            processedEvents: forwardStats.processedEvents + backwardStats.processedEvents,
            unprocessedEvents: forwardStats.unprocessedEvents + backwardStats.unprocessedEvents,
            eventsByType: {
              ...Object.keys(forwardStats.eventsByType).reduce((acc, key) => {
                acc[key] = (forwardStats.eventsByType[key] || 0) + (backwardStats.eventsByType[key] || 0);
                return acc;
              }, {} as Record<string, number>),
            },
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get processing statistics',
          cause: error,
        });
      }
    }),

  // Check if service is ready
  isReady: publicProcedure
    .query(() => {
      return {
        ready: dualDirectionContractEventsService.isReady(),
      };
    }),

  // Get cursor information for both directions
  getCursors: publicProcedure
    .query(async () => {
      try {
        // This would require adding a method to get cursor info from the schedulers
        // For now, return placeholder info
        return {
          forward: {
            jobName: 'contract-events-etl-forward',
            description: 'Cursor for forward direction (newest → oldest)',
          },
          backward: {
            jobName: 'contract-events-etl-backward', 
            description: 'Cursor for backward direction (oldest → newest)',
          },
          explanation: 'Each direction maintains its own cursor to track progress independently',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get cursor information',
          cause: error,
        });
      }
    }),

  // Reset cursors for specific direction
  resetCursor: publicProcedure
    .input(z.object({
      direction: z.enum(['forward', 'backward']),
      confirm: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      if (!input.confirm) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cursor reset requires confirmation',
        });
      }

      try {
        // This would require implementing cursor reset functionality
        // For now, return a message
        return {
          success: true,
          message: `Cursor reset requested for ${input.direction} direction`,
          warning: 'This will cause the ETL to restart from the beginning for this direction',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reset cursor',
          cause: error,
        });
      }
    }),
}); 