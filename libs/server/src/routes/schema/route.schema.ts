import { pgTable, serial, varchar, integer, timestamp, text, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const routesSchema = pgTable('routes', {
    id: serial('id').primaryKey(),

    // Route identification
    routeId: serial('route_id').notNull(), // Auto-incremented route ID
    name: varchar('name', { length: 255 }), // Optional name for the route
    description: text('description'), // Optional description

    // Token information
    tokenType: varchar('token_type', { length: 10 }).notNull(), // 'SPL' or 'SOL'
    tokenMint: varchar('token_mint'), // SPL token mint address (null for SOL)
    tokenSymbol: varchar('token_symbol', { length: 20 }), // Token symbol (e.g., 'USDC', 'SOL', 'BONK')
    tokenDecimals: integer('token_decimals').notNull().default(6), // Token decimals

    // Route configuration
    hopAmountTokens: varchar('hop_amount_tokens').notNull(), // Human readable amount (e.g., "0.5")
    hopAmountRaw: varchar('hop_amount_raw').notNull(), // Raw amount in token units

    // Route type
    isEasyRoute: boolean('is_easy_route').default(false).notNull(),

    // Obfuscation (wallet mixing before contract invocation)
    hasObfuscation: boolean('has_obfuscation').default(false).notNull(), // false for existing routes, true for new

    // Ownership and metadata
    creator: varchar('creator').notNull(), // Creator wallet address
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),

    // Deployment status
    status: varchar('status', { length: 20 }).notNull().default('draft'), // 'draft', 'deploying', 'deployed', 'failed'
    deployedAt: timestamp('deployed_at', { withTimezone: true }),
    deploymentTxHash: varchar('deployment_tx_hash'),
    routeConfigPda: varchar('route_config_pda'), // On-chain PDA after deployment
    deploymentError: text('deployment_error'),

    // Legacy fields (for backwards compatibility)
    token: varchar('token'), // Keep for now
    amount: varchar('amount'), // Keep for now
    pairMint: varchar('pair_mint'), // Keep for now
    owner: varchar('owner'), // Keep for now
    currentIndex: integer('current_index').default(0),
    lastIndex: integer('last_index'),
});

// Define relations
export const routesRelations = relations(routesSchema, ({ many, one }) => ({
  hops: many(hopsSchema),
  obfuscationSession: one(obfuscationSessionsSchema, {
    fields: [routesSchema.id],
    references: [obfuscationSessionsSchema.routeId],
  }),
}));

export type Routes = typeof routesSchema.$inferSelect;
export type NewRoute = typeof routesSchema.$inferInsert;

// Type for timestamp-based hop input
export interface RouteHopData {
    recipient: string;
    scheduledAt: string; // When this hop should execute
    delayMinutes?: number; // Optional delay metadata for recalculation
    isCustomTime?: boolean; // Whether this hop uses a custom time vs delay-based
}

// Legacy type for backwards compatibility with delay-based systems
export interface LegacyRouteHopData {
    recipient: string;
    delayMinutes: string; // Human readable delay in minutes
    delaySeconds: string; // Converted delay in seconds
}

// Type for creating a new route with timestamp-based hops
export interface CreateRouteInput {
    name?: string;
    description?: string;
    tokenType: 'SPL' | 'SOL';
    tokenMint?: string;
    tokenSymbol?: string;
    tokenDecimals: number;
    hopAmountTokens: string;
    hopAmountRaw: string;
    hops: RouteHopData[];
    creator: string;
    isEasyRoute?: boolean;
}

// Type for route with deployment info and calculated delays
export interface RouteWithStatus extends Routes {
    canDeploy: boolean;
    deploymentStatus: 'draft' | 'deploying' | 'deployed' | 'completed' | 'failed';
    obfuscationStatus?: string | null; // Status of the obfuscation session if any
    hops?: (RouteHopData & {
        delayMinutes?: number; // Calculated from timestamp differences
        delaySeconds?: number; // Calculated from timestamp differences
    })[]; // For backwards compatibility, will be populated from relational hops
}

// Import schemas for relations (must be after routesSchema definition to avoid circular imports)
import { hopsSchema } from "../../hops/schema/hops.schema";
import { obfuscationSessionsSchema } from "../../obfuscation/schema/obfuscation.schema";
