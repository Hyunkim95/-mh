import {
  PublicKey,
  ParsedTransactionWithMeta,
  Connection,
  clusterApiUrl,
} from "@solana/web3.js";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { BorshEventCoder } from "@coral-xyz/anchor";
import {
  SolanaTransactionEtlJob,
  SolanaTransactionETLConfig,
  SolanaTransactionData,
  SolanaSchemaMapper,
} from "@libs/solana-node";
import { EtlJobConfig } from "@libs/etl";
import {
  contractTransactions,
  contractEvents,
  NewContractTransaction,
  NewContractEvent,
} from "./schemas";
import {
  buildEventParser,
  getRouteIdFromPda,
  MULTI_HOPPER_PROGRAM_ID,
} from "./contract-utils";
import * as IDLJson from "./idl/multi_hopper_project.json";

const IDL = IDLJson as any;

// Event type definitions matching the IDL
export interface HopCompletedEvent {
  route: string;
  hopIndex: number;
  fromOwner: string;
  toOwner: string;
  amount: string;
  at: string;
}

export interface RouteCreatedEvent {
  route: string;
  creator: string;
  mint: string;
  hops: number;
}

export interface RouteFinishedEvent {
  route: string;
  at: string;
}

export interface TokenConfigCreatedEvent {
  tokenConfig: string;
  creator: string;
  mint: string;
  minTransfer: number;
  feeBps: number;
  feeTreasury: string;
  maxHops: number;
  maxDelaySeconds: string;
  timelockSeconds: string;
  pairAddress: string;
  flatFeeLamports: string;
}

export type ContractEventData =
  | { type: "hopCompleted"; data: HopCompletedEvent }
  | { type: "routeCreated"; data: RouteCreatedEvent }
  | { type: "routeFinished"; data: RouteFinishedEvent }
  | { type: "tokenConfigCreated"; data: TokenConfigCreatedEvent };

export interface ContractTransactionData {
  signature: string;
  slot: number;
  blockTime: number | null;
  fee: number;
  success: boolean;
  error?: string;
  events: ContractEventData[];
  transaction: ParsedTransactionWithMeta;
}

// Schema mapper that transforms Solana transaction data to our contract format
class ContractEventsSchemaMapper
  implements SolanaSchemaMapper<ContractTransactionData>
{
  private eventCoder: BorshEventCoder;

  constructor() {
    this.eventCoder = new BorshEventCoder(IDL);
  }

  mapTransactionToSchema(
    txData: SolanaTransactionData
  ): ContractTransactionData {
    const events: ContractEventData[] = [];

    if (txData.transaction?.meta?.logMessages) {
      events.push(
        ...this.parseEventsFromLogs(txData.transaction.meta.logMessages)
      );
    }

    return {
      signature: txData.signature,
      slot: txData.slot,
      blockTime: txData.blockTime ?? null,
      fee: txData.fee || 0,
      success: !txData.err,
      error: txData.err ? JSON.stringify(txData.err) : undefined,
      events,
      transaction: txData.transaction!,
    };
  }

  validateMappedData(data: ContractTransactionData): boolean {
    return !!(data.signature && data.slot !== undefined);
  }

  private parseEventsFromLogs(logs: string[]): ContractEventData[] {
    const events: ContractEventData[] = [];
    const eventParser = buildEventParser(
      MULTI_HOPPER_PROGRAM_ID,
      new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl("devnet"))
    );
    const decoded = [...eventParser.parseLogs(logs)];
    if (!decoded) return [];
    for (const event of decoded) {
      const parsedEvent = this.parseEvent(event);
      if (parsedEvent) {
        events.push(parsedEvent);
      }
    }

    return events;
  }

  private parseEvent(event: any): ContractEventData | null {
    const eventName = event.name;
    const eventData = event.data;

    switch (eventName) {
      case "hopCompleted":
        return {
          type: "hopCompleted",
          data: {
            route: eventData.route,
            hopIndex: eventData.hopIndex || eventData.hop_index || 0,
            fromOwner: eventData.fromOwner,
            toOwner: eventData.toOwner,
            amount: eventData.amount,
            at: eventData.at,
          },
        };

      case "routeCreated":
        return {
          type: "routeCreated",
          data: {
            route: eventData.route,
            creator: eventData.creator,
            mint: eventData.mint,
            hops: eventData.hops || 0,
          },
        };

      case "routeFinished":
        return {
          type: "routeFinished",
          data: {
            route: eventData.route,
            at: eventData.at,
          },
        };

      case "tokenConfigCreated":
        return {
          type: "tokenConfigCreated",
          data: {
            tokenConfig: eventData.tokenConfig,
            creator: eventData.creator,
            mint: eventData.mint,
            minTransfer: eventData.minTransfer,
            feeBps: eventData.feeBps,
            feeTreasury: eventData.feeTreasury,
            maxHops: eventData.maxHops,
            maxDelaySeconds: eventData.maxDelaySeconds,
            timelockSeconds: eventData.timelockSeconds,
            flatFeeLamports: eventData.flatFeeLamports,
            pairAddress: eventData.pairAddress,
          },
        };

      default:
        console.log(`Unknown event type: ${eventName}`);
        return null;
    }
  }
}

export class ContractEventsEtlJob extends SolanaTransactionEtlJob<ContractTransactionData> {
  private programId: string;

  constructor(
    etlConfig: EtlJobConfig,
    db: NodePgDatabase<any>,
    rpcUrl: string,
    programId: string,
    direction: "forward" | "backward" = "forward"
  ) {
    const solanaConfig: SolanaTransactionETLConfig = {
      type: "transactions",
      rpcUrl,
      programId, // Filter transactions for this program
      direction,
      maxSignatures: 100, // Smaller batches for event processing
      commitment: "confirmed",
      delayMs: 200, // Rate limiting
    };

    const schemaMapper = new ContractEventsSchemaMapper();

    super(etlConfig, db, solanaConfig, contractTransactions, schemaMapper);
    this.programId = programId;
  }

  // Override the load method to also store events
  protected async load(data: ContractTransactionData[]): Promise<any> {
    if (data.length === 0) {
      return {
        success: true,
        processedCount: 0,
        metadata: { message: "No data to load" },
      };
    }

    let processedCount = 0;
    const errors: Array<{
      data: ContractTransactionData;
      error: Error;
      index: number;
    }> = [];

    try {
      // Process transactions in batches
      for (const txData of data) {
        try {
          await this.db.transaction(async (tx: any) => {
            // Insert the transaction record
            const newTransaction: NewContractTransaction = {
              signature: txData.signature,
              slot: txData.slot,
              blockTime: txData.blockTime
                ? new Date(txData.blockTime * 1000)
                : null,
              fee: txData.fee,
              success: txData.success,
              error: txData.error,
              programId: this.programId,
              transactionData: txData.transaction as any,
            };

            const [insertedTransaction] = await tx
              .insert(contractTransactions)
              .values(newTransaction)
              .onConflictDoUpdate({
                target: contractTransactions.signature,
                set: {
                  processedAt: new Date(),
                },
              })
              .returning();

            // Only insert events if this is a new transaction (not a duplicate)
            // Check if events already exist for this signature
            const existingEvents = await tx
              .select({ count: contractEvents.id })
              .from(contractEvents)
              .where(eq(contractEvents.signature, txData.signature));

            if (txData.events.length > 0 && existingEvents.length === 0) {
              const eventRecords: NewContractEvent[] = [];

              for (const event of txData.events) {
                const routeId = await this.extractRouteId(event);
                eventRecords.push({
                  transactionId: insertedTransaction.id,
                  signature: txData.signature,
                  eventType: event.type,
                  eventData: event.data as any,
                  routePda: this.extractRoutePda(event),
                  routeId,
                  creator: this.extractCreator(event),
                  hopIndex: this.extractHopIndex(event),
                });
              }

              await tx.insert(contractEvents).values(eventRecords);
              console.log(
                `Inserted ${eventRecords.length} new events for transaction ${txData.signature}`
              );
            } else if (existingEvents.length > 0) {
              console.log(
                `Skipping events for duplicate transaction ${txData.signature}`
              );
            }
          });

          processedCount++;
        } catch (error) {
          errors.push({
            data: txData,
            error: error instanceof Error ? error : new Error(String(error)),
            index: processedCount,
          });
        }
      }

      return {
        success: errors.length === 0,
        processedCount,
        errors: errors.length > 0 ? errors : undefined,
        metadata: {
          totalRecords: data.length,
          successCount: processedCount,
          errorCount: errors.length,
          eventsExtracted: data.reduce((sum, tx) => sum + tx.events.length, 0),
        },
      };
    } catch (error) {
      throw new Error(
        `Failed to load contract data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Helper methods to extract common fields from events
  private extractRoutePda(event: ContractEventData): string | null {
    switch (event.type) {
      case "hopCompleted":
      case "routeCreated":
      case "routeFinished":
        return event.data.route.toString();
      default:
        return null;
    }
  }

  private async extractRouteId(
    event: ContractEventData
  ): Promise<number | null> {
    try {
      switch (event.type) {
        case "hopCompleted":
        case "routeCreated":
        case "routeFinished":
          // Derive route ID from the route PDA
          return await getRouteIdFromPda(
            new PublicKey(event.data.route),
            MULTI_HOPPER_PROGRAM_ID
          );
        default:
          return null;
      }
    } catch (error) {
      console.warn(`Failed to extract route ID from event:`, error);
      return null;
    }
  }

  private extractCreator(event: ContractEventData): string | null {
    switch (event.type) {
      case "routeCreated":
      case "tokenConfigCreated":
        return event.data.creator.toString();
      default:
        return null;
    }
  }

  private extractHopIndex(event: ContractEventData): number | null {
    switch (event.type) {
      case "hopCompleted":
        return event.data.hopIndex;
      default:
        return null;
    }
  }

  protected async beforeJob(): Promise<void> {
    await super.beforeJob();
    console.log(`Starting contract events ETL for program: ${this.programId}`);
  }

  protected async afterJob(result: any): Promise<void> {
    await super.afterJob(result);
    console.log(
      `Contract events ETL completed. Events extracted: ${
        result.metadata?.eventsExtracted || 0
      }`
    );
  }
}
