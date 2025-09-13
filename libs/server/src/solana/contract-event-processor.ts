import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, isNull, inArray, gt } from 'drizzle-orm';
import { PublicKey } from '@solana/web3.js';
import { 
  contractEvents, 
  ContractEvent,
  routesSchema,
  hopsSchema 
} from '../db/schema';
import { HopCompletedEvent, RouteCreatedEvent, RouteFinishedEvent } from './contract-events-etl';
import { 
  getRouteIdFromPda, 
  MULTI_HOPPER_PROGRAM_ID 
} from './contract-utils';

export class ContractEventProcessor {
  constructor(private db: NodePgDatabase<any>) {}

  /**
   * Convert hex timestamp to Date object
   * @param hexTimestamp - Hex string timestamp (e.g., '68c33668')
   * @returns Date object
   */
  private convertHexTimestampToDate(hexTimestamp: string): Date {
    // Convert hex string to decimal number (Unix timestamp in seconds)
    const unixTimestamp = parseInt(hexTimestamp, 16);
    // Convert to milliseconds and create Date
    return new Date(unixTimestamp * 1000);
  }

  /**
   * Process all unprocessed contract events
   */
  async processUnprocessedEvents(): Promise<{
    processed: number;
    errors: Array<{ eventId: number; error: string }>;
  }> {
    const unprocessedEvents = await this.db
      .select()
      .from(contractEvents)
      .where(eq(contractEvents.processed, false))
      .orderBy(contractEvents.createdAt);

    let processed = 0;
    const errors: Array<{ eventId: number; error: string }> = [];

    console.log(`Processing ${unprocessedEvents.length} unprocessed contract events`);

    for (const event of unprocessedEvents) {
      try {
        await this.processEvent(event);
        
        // Mark event as processed
        await this.db
          .update(contractEvents)
          .set({ 
            processed: true, 
            processedAt: new Date() 
          })
          .where(eq(contractEvents.id, event.id));

        processed++;
      } catch (error) {
        console.error(`Failed to process event ${event.id}:`, error);
        errors.push({
          eventId: event.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(`Processed ${processed} events, ${errors.length} errors`);
    return { processed, errors };
  }

  /**
   * Process a single contract event
   */
  private async processEvent(event: ContractEvent): Promise<void> {
    console.log('Processing event:', event);
    switch (event.eventType) {
      
      case 'hopCompleted':
        
        await this.processHopCompletedEvent(event);
        break;
      case 'routeCreated':
        await this.processRouteCreatedEvent(event);
        break;
      case 'routeFinished':
        await this.processRouteFinishedEvent(event);
        break;
      case 'tokenConfigCreated':
        await this.processTokenConfigCreatedEvent(event);
        break;
      default:
        console.log(`Unknown event type: ${event.eventType}`);
    }
  }

  /**
   * Process HopCompleted event - update hop execution status and route state
   */
  private async processHopCompletedEvent(event: ContractEvent): Promise<void> {
    const eventData = event.eventData as HopCompletedEvent;
    
    await this.db.transaction(async (tx) => {
      // First, try to find the route by PDA
      let route = await tx
        .select()
        .from(routesSchema)
        .where(eq(routesSchema.routeConfigPda, event.routePda!))
        .limit(1);

      if (route.length === 0) {
        // If not found by PDA, try to get route ID from on-chain and find by route ID
        console.log(`Route not found by PDA: ${event.routePda}, attempting to resolve route ID from chain`);
        
        try {
          const routeId = await getRouteIdFromPda(new PublicKey(event.routePda!), MULTI_HOPPER_PROGRAM_ID);
          if (routeId !== null) {
            // Try to find route by route ID
            route = await tx
              .select()
              .from(routesSchema)
              .where(eq(routesSchema.routeId, routeId))
              .limit(1);
              
            if (route.length > 0) {
              // Update the route with the discovered PDA
              await tx
                .update(routesSchema)
                .set({
                  routeConfigPda: event.routePda!,
                  updatedAt: new Date(),
                })
                .where(eq(routesSchema.id, route[0].id));
                
              console.log(`Updated route ${route[0].id} with PDA ${event.routePda}`);
            }
          }
        } catch (error) {
          console.warn(`Failed to resolve route ID from PDA ${event.routePda}:`, error);
        }
      }

      if (route.length === 0) {
        console.warn(`Route not found for PDA: ${event.routePda}`);
        return;
      }

      const routeRecord = route[0];

      // Find the specific hop that was completed
      const hop = await tx
        .select()
        .from(hopsSchema)
        .where(and(
          eq(hopsSchema.routeId, routeRecord.id),
          eq(hopsSchema.hopIndex, eventData.hopIndex)
        ))
        .limit(1);

      if (hop.length === 0) {
        console.warn(`Hop not found for route ${routeRecord.id}, index ${eventData.hopIndex}`);
        return;
      }

      const executionTime = this.convertHexTimestampToDate(eventData.at);

      // Update the hop as executed
      await tx
        .update(hopsSchema)
        .set({
          executedAt: executionTime,
          txHash: event.signature,
          updatedAt: new Date(),
        })
        .where(eq(hopsSchema.id, hop[0].id));

      // Update route's current index
      const newCurrentIndex = eventData.hopIndex + 1;
      await tx
        .update(routesSchema)
        .set({
          currentIndex: newCurrentIndex,
          updatedAt: new Date(),
        })
        .where(eq(routesSchema.id, routeRecord.id));

      // DYNAMIC SCHEDULING: Update all subsequent hops' scheduledAt based on actual execution time
      // This ensures that if a hop executes late (due to failures, retries, etc.), 
      // all subsequent hops are rescheduled appropriately to maintain the original delays
      
      // DYNAMIC SCHEDULING: Get all subsequent hops that haven't been executed yet
      const allSubsequentHops = await tx
        .select()
        .from(hopsSchema)
        .where(and(
          eq(hopsSchema.routeId, routeRecord.id),
          gt(hopsSchema.hopIndex, eventData.hopIndex), // All hops after the current one
          isNull(hopsSchema.executedAt) // Only update if not already executed
        ))
        .orderBy(hopsSchema.hopIndex);

      if (allSubsequentHops.length > 0) {
        // Calculate the time shift: difference between actual and originally scheduled execution
        const currentHopOriginalScheduledAt = hop[0].scheduledAt;
        const timeShiftMs = executionTime.getTime() - currentHopOriginalScheduledAt.getTime();

        console.log(`Dynamic scheduling: Time shift detected: ${timeShiftMs}ms (executed at ${executionTime.toISOString()}, originally scheduled at ${currentHopOriginalScheduledAt.toISOString()})`);

        // Update all subsequent hops by applying the same time shift

        let updatedCount = 0;
        for (const subsequentHop of allSubsequentHops) {
          // Apply the same time shift to each subsequent hop
          const newScheduledAt = new Date(subsequentHop.scheduledAt.getTime() + timeShiftMs);

          // Only update if the time shift is significant (more than 1 second)
          if (Math.abs(timeShiftMs) > 1000) {
            await tx
              .update(hopsSchema)
              .set({
                scheduledAt: newScheduledAt,
                updatedAt: new Date(),
              })
              .where(eq(hopsSchema.id, subsequentHop.id));

            console.log(`Dynamic scheduling: Updated hop ${subsequentHop.hopIndex} scheduledAt from ${subsequentHop.scheduledAt.toISOString()} to ${newScheduledAt.toISOString()}`);
            updatedCount++;
          }
        }

        if (updatedCount > 0) {
          console.log(`Dynamic scheduling: Updated ${updatedCount} subsequent hops with time shift of ${timeShiftMs}ms`);
        }
      }

      console.log(`Processed HopCompleted: route ${routeRecord.id}, hop ${eventData.hopIndex}`);
    });
  }

  /**
   * Process RouteCreated event - link on-chain route to database record
   */
  private async processRouteCreatedEvent(event: ContractEvent): Promise<void> {
    const eventData = event.eventData as RouteCreatedEvent;
    
    // First, try to get the route ID from the on-chain route config
    let onChainRouteId: number | null = null;
    try {
      onChainRouteId = await getRouteIdFromPda(new PublicKey(eventData.route), MULTI_HOPPER_PROGRAM_ID);
    } catch (error) {
      console.warn(`Failed to get route ID from PDA ${eventData.route.toString()}:`, error);
    }
    
    // Try to find a route by route ID first (most accurate), then by creator
    let route;
    if (onChainRouteId !== null) {
      route = await this.db
        .select()
        .from(routesSchema)
        .where(and(
          eq(routesSchema.routeId, onChainRouteId),
          eq(routesSchema.creator, eventData.creator.toString())
        ))
        .limit(1);
    }
    
    if (!route || route.length === 0) {
      // Fallback to finding by creator and no PDA
      route = await this.db
        .select()
        .from(routesSchema)
        .where(and(
          eq(routesSchema.creator, eventData.creator.toString()),
          isNull(routesSchema.routeConfigPda)
        ))
        .orderBy(routesSchema.createdAt) // Get the oldest matching route
        .limit(1);
    }

    if (!route || route.length === 0) {
      console.warn(`No matching route found for creator: ${eventData.creator.toString()}, route ID: ${onChainRouteId}`);
      return;
    }

    // Update the route with the on-chain PDA and deployment info
    await this.db
      .update(routesSchema)
      .set({
        routeConfigPda: eventData.route.toString(),
        status: 'deployed',
        deployedAt: new Date(),
        deploymentTxHash: event.signature,
        updatedAt: new Date(),
      })
      .where(eq(routesSchema.id, route[0].id));
    console.log(`Processed RouteCreated: linked route ${route[0].id} to PDA ${eventData.route.toString()}`);
  }

  /**
   * Process RouteFinished event - mark route as completed
   */
  private async processRouteFinishedEvent(event: ContractEvent): Promise<void> {
    const eventData = event.eventData as RouteFinishedEvent;
    
    // Find the route by PDA
    const route = await this.db
      .select()
      .from(routesSchema)
      .where(eq(routesSchema.routeConfigPda, eventData.route.toString()))
      .limit(1);

    if (route.length === 0) {
      console.warn(`Route not found for PDA: ${eventData.route.toString()}`);
      return;
    }

    // Update route status to completed
    await this.db
      .update(routesSchema)
      .set({
        status: 'completed', // Add this status if it doesn't exist
        updatedAt: new Date(),
      })
      .where(eq(routesSchema.id, route[0].id));

    console.log(`Processed RouteFinished: route ${route[0].id} completed at ${this.convertHexTimestampToDate(eventData.at)}`);
  }

  /**
   * Process TokenConfigCreated event - for future token config tracking
   */
  private async processTokenConfigCreatedEvent(event: ContractEvent): Promise<void> {
    // This could be used to track token config creation
    // For now, just log it
    console.log(`tokenConfigCreated: ${event.eventData}`);
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<{
    totalEvents: number;
    processedEvents: number;
    unprocessedEvents: number;
    eventsByType: Record<string, number>;
  }> {
    const [totalResult, processedResult, unprocessedResult] = await Promise.all([
      this.db.select({ count: contractEvents.id }).from(contractEvents),
      this.db.select({ count: contractEvents.id }).from(contractEvents).where(eq(contractEvents.processed, true)),
      this.db.select({ count: contractEvents.id }).from(contractEvents).where(eq(contractEvents.processed, false)),
    ]);

    // Get event counts by type
    const eventTypes = await this.db
      .select({
        eventType: contractEvents.eventType,
        count: contractEvents.id,
      })
      .from(contractEvents);

    const eventsByType: Record<string, number> = {};
    for (const event of eventTypes) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
    }

    return {
      totalEvents: totalResult.length,
      processedEvents: processedResult.length,
      unprocessedEvents: unprocessedResult.length,
      eventsByType,
    };
  }

  /**
   * Reprocess failed events
   */
  async reprocessFailedEvents(eventIds?: number[]): Promise<void> {
    let eventsToReprocess;
    
    if (eventIds) {
      eventsToReprocess = await this.db
        .select()
        .from(contractEvents)
        .where(and(
          inArray(contractEvents.id, eventIds),
          eq(contractEvents.processed, false)
        ));
    } else {
      // Reprocess all unprocessed events
      eventsToReprocess = await this.db
        .select()
        .from(contractEvents)
        .where(eq(contractEvents.processed, false));
    }

    console.log(`Reprocessing ${eventsToReprocess.length} events`);
    
    for (const event of eventsToReprocess) {
      try {
        await this.processEvent(event);
        
        await this.db
          .update(contractEvents)
          .set({ 
            processed: true, 
            processedAt: new Date() 
          })
          .where(eq(contractEvents.id, event.id));

        console.log(`Reprocessed event ${event.id}`);
      } catch (error) {
        console.error(`Failed to reprocess event ${event.id}:`, error);
      }
    }
  }
} 