import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, inArray } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import { routesSchema, hopsSchema } from "../../db/schema";
import { contractEvents, ContractEvent } from "../schemas";
import {
  HopCompletedEvent,
  RouteCreatedEvent,
  RouteFinishedEvent,
  TokenConfigCreatedEvent,
  TokenConfigUpdatedEvent,
} from "./contract-events-etl";
import {
  getRouteIdFromPda,
  MULTI_HOPPER_PROGRAM_ID,
} from "./contract-utils";
import { tokenConfigsService } from "../../token-configs/services/token-configs.service";
import { createLogger } from "@libs/logger";

const log = createLogger("EventProcessor");

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
   * Convert hex string to number
   * @param hexString - Hex string value (e.g., '0e10', '0f4240')
   * @returns Number
   */
  private convertHexToNumber(hexString: string): number {
    return parseInt(hexString, 16);
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
      .orderBy(contractEvents.createdAt)
      .limit(100);

    let processed = 0;
    const errors: Array<{ eventId: number; error: string }> = [];

    log.debug(
      `Processing ${unprocessedEvents.length} unprocessed contract events`
    );

    for (const event of unprocessedEvents) {
      try {
        await this.processEvent(event);

        // Mark event as processed
        await this.db
          .update(contractEvents)
          .set({
            processed: true,
            processedAt: new Date(),
          })
          .where(eq(contractEvents.id, event.id));

        processed++;
      } catch (error) {
        log.error(`Failed to process event ${event.id}:`, error);
        errors.push({
          eventId: event.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    log.info(`Processed ${processed} events, ${errors.length} errors`);
    return { processed, errors };
  }

  /**
   * Process a single contract event
   */
  private async processEvent(event: ContractEvent): Promise<void> {
    log.debug(`Processing event: id=${event.id} type=${event.eventType}`);
    switch (event.eventType) {
      case "hopCompleted":
        await this.processHopCompletedEvent(event);
        break;
      case "routeCreated":
        await this.processRouteCreatedEvent(event);
        break;
      case "routeFinished":
        await this.processRouteFinishedEvent(event);
        break;
      case "tokenConfigCreated":
        await this.processTokenConfigCreatedEvent(event);
        break;
      case "tokenConfigUpdated":
        await this.processTokenConfigUpdatedEvent(event);
        break;
      default:
        log.warn(`Unknown event type: ${event.eventType}`);
    }
  }

  async processTokenConfigUpdatedEvent(event: ContractEvent): Promise<void> {
    const eventData = event.eventData as TokenConfigUpdatedEvent;
    tokenConfigsService.update(eventData.tokenConfig.toString(), {
      minTransferAmount: this.convertHexToNumber(
        eventData.minTransfer.toString()
      ),
      feeBps: Number(eventData.feeBps),
      feeTreasury: eventData.feeTreasury.toString(),
      maxHops: Number(eventData.maxHops),
      flatFeeLamports: this.convertHexToNumber(
        eventData.flatFeeLamports.toString()
      ),
    });
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
        log.info(
          `Route not found by PDA: ${event.routePda}, attempting to resolve route ID from chain`
        );

        try {
          const routeId = await getRouteIdFromPda(
            new PublicKey(event.routePda!),
            MULTI_HOPPER_PROGRAM_ID
          );
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

              log.info(
                `Updated route ${route[0].id} with PDA ${event.routePda}`
              );
            }
          }
        } catch (error) {
          log.warn(
            `Failed to resolve route ID from PDA ${event.routePda}:`,
            error
          );
        }
      }

      if (route.length === 0) {
        log.warn(`Route not found for PDA: ${event.routePda}`);
        return;
      }

      const routeRecord = route[0];

      // Find the specific hop that was completed
      const hop = await tx
        .select()
        .from(hopsSchema)
        .where(
          and(
            eq(hopsSchema.routeId, routeRecord.id),
            eq(hopsSchema.hopIndex, eventData.hopIndex)
          )
        )
        .limit(1);

      if (hop.length === 0) {
        log.warn(
          `Hop not found for route ${routeRecord.id}, index ${eventData.hopIndex}`
        );
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

      log.info(
        `Processed HopCompleted: route ${routeRecord.id}, hop ${eventData.hopIndex}`
      );
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
      onChainRouteId = await getRouteIdFromPda(
        new PublicKey(eventData.route),
        MULTI_HOPPER_PROGRAM_ID
      );
    } catch (error) {
      log.warn(
        `Failed to get route ID from PDA ${eventData.route.toString()}:`,
        error
      );
    }

    // Try to find a route by route ID first (most accurate), then by creator
    let route;
    if (onChainRouteId !== null) {
      route = await this.db
        .select()
        .from(routesSchema)
        .where(
          and(
            eq(routesSchema.routeId, onChainRouteId),
            eq(routesSchema.creator, eventData.creator.toString())
          )
        )
        .limit(1);
    }

    if (!route || route.length === 0) {
      // Fallback: match by deployment transaction hash (much safer than "oldest route")
      // The client sets deploymentTxHash when marking route as deployed
      route = await this.db
        .select()
        .from(routesSchema)
        .where(
          and(
            eq(routesSchema.creator, eventData.creator.toString()),
            eq(routesSchema.deploymentTxHash, event.signature)
          )
        )
        .limit(1);

      if (route && route.length > 0) {
        log.info(
          `Matched route ${route[0].id} by transaction hash fallback`
        );
      }
    }

    if (!route || route.length === 0) {
      new Date(),
        log.warn(
          `No matching route found for creator: ${eventData.creator.toString()}, route ID: ${onChainRouteId}`
        );
      return;
    }

    // Update the route with the on-chain PDA and deployment info
    await this.db
      .update(routesSchema)
      .set({
        routeConfigPda: eventData.route.toString(),
        status: "deployed",
        deployedAt: new Date(),
        deploymentTxHash: event.signature,
        updatedAt: new Date(),
      })
      .where(eq(routesSchema.id, route[0].id));
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
      log.warn(`Route not found for PDA: ${eventData.route.toString()}`);
      return;
    }

    // Update route status to completed
    await this.db
      .update(routesSchema)
      .set({
        status: "completed", // Add this status if it doesn't exist
        updatedAt: new Date(),
      })
      .where(eq(routesSchema.id, route[0].id));

    log.info(
      `Processed RouteFinished: route ${
        route[0].id
      } completed at ${this.convertHexTimestampToDate(eventData.at)}`
    );
  }

  /**
   * Process TokenConfigCreated event - for future token config tracking
   */
  private async processTokenConfigCreatedEvent(
    event: ContractEvent
  ): Promise<void> {
    const eventData = event.eventData as TokenConfigCreatedEvent;
    tokenConfigsService.create({
      tokenConfigAddress: eventData.tokenConfig.toString(),
      tokenMint: 'Deprecated',
      creator: eventData.creator.toString(),
      minTransferAmount: this.convertHexToNumber(
        eventData.minTransfer.toString()
      ),
      feeBps: Number(eventData.feeBps),
      feeTreasury: eventData.feeTreasury.toString(),
      maxHops: Number(eventData.maxHops),
      maxDelaySeconds: 0,
      timelockSeconds: 0,
      flatFeeLamports: this.convertHexToNumber(
        eventData.flatFeeLamports.toString()
      ),
      pairAddress: 'Deprecated',
    });
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
    const [totalResult, processedResult, unprocessedResult] = await Promise.all(
      [
        this.db.select({ count: contractEvents.id }).from(contractEvents),
        this.db
          .select({ count: contractEvents.id })
          .from(contractEvents)
          .where(eq(contractEvents.processed, true)),
        this.db
          .select({ count: contractEvents.id })
          .from(contractEvents)
          .where(eq(contractEvents.processed, false)),
      ]
    );

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
        .where(
          and(
            inArray(contractEvents.id, eventIds),
            eq(contractEvents.processed, false)
          )
        );
    } else {
      // Reprocess all unprocessed events
      eventsToReprocess = await this.db
        .select()
        .from(contractEvents)
        .where(eq(contractEvents.processed, false));
    }

    log.info(`Reprocessing ${eventsToReprocess.length} events`);

    for (const event of eventsToReprocess) {
      try {
        await this.processEvent(event);

        await this.db
          .update(contractEvents)
          .set({
            processed: true,
            processedAt: new Date(),
          })
          .where(eq(contractEvents.id, event.id));

        log.debug(`Reprocessed event ${event.id}`);
      } catch (error) {
        log.error(`Failed to reprocess event ${event.id}:`, error);
      }
    }
  }
}
