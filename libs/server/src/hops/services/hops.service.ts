import { db, hopsSchema } from "../../db";
import { routesSchema } from "../../routes/schema/route.schema";
import { and, asc, eq, lte, isNull } from "drizzle-orm";
import { CreateHopInput, Hop } from "../schema/hops.schema";
import { utcNow, toUtc } from "../../utils/timezone";

// Mark next hop as ready for execution and set execution time
// Get hops for a specific route ordered by index
const getHopsByRoute = async (routeId: number): Promise<Hop[]> => {
    const hops = await db.select()
        .from(hopsSchema)
        .where(eq(hopsSchema.routeId, routeId))
        .orderBy(asc(hopsSchema.hopIndex));
    return hops;
}

// Get a specific hop by route and index
const getHopByRouteAndIndex = async (routeId: number, hopIndex: number): Promise<Hop | null> => {
    const [hop] = await db.select()
        .from(hopsSchema)
        .where(
            and(
                eq(hopsSchema.routeId, routeId),
                eq(hopsSchema.hopIndex, hopIndex)
            )
        );
    return hop || null;
}

// Create multiple timestamp-based hops for a route
const createHopsForRoute = async (routeId: number, hopsData: Omit<CreateHopInput, 'routeId'>[]): Promise<Hop[]> => {
    const hopsToCreate: CreateHopInput[] = hopsData.map(hop => ({
        ...hop,
        routeId,
    }));

    const createdHops = await db.insert(hopsSchema).values(hopsToCreate).returning();
    return createdHops;
}

// Update hop execution status
const updateHopExecution = async (
    hopId: number, 
    executionData: {
        executedAt?: Date;
        txHash?: string;
        error?: string;
    }
): Promise<Hop | null> => {
    const updateData = {
        ...executionData,
        updatedAt: utcNow(),
    };
    
    // Ensure executedAt is UTC if provided
    if (executionData.executedAt) {
        updateData.executedAt = toUtc(executionData.executedAt);
    }
    
    const [updatedHop] = await db.update(hopsSchema)
        .set(updateData)
        .where(eq(hopsSchema.id, hopId))
        .returning();
    
    return updatedHop || null;
}

// Update scheduled execution time for a hop
const updateHopSchedule = async (hopId: number, scheduledAt: Date): Promise<Hop | null> => {
    const utcScheduledAt = toUtc(scheduledAt);
    const [updatedHop] = await db.update(hopsSchema)
        .set({
            scheduledAt: utcScheduledAt,
            updatedAt: utcNow(),
        })
        .where(eq(hopsSchema.id, hopId))
        .returning();
    
    return updatedHop || null;
}



// Delete all hops for a route (used when route is deleted - cascade should handle this but this is explicit)
const deleteHopsForRoute = async (routeId: number): Promise<number> => {
    const result = await db.delete(hopsSchema)
        .where(eq(hopsSchema.routeId, routeId));
    
    return result.rowCount ?? 0;
}

// Get pending hops (not yet executed) ordered by scheduled time
const getPendingHops = async (routeId?: number): Promise<Hop[]> => {
    const conditions = [isNull(hopsSchema.executedAt)];
    if (routeId) {
        conditions.push(eq(hopsSchema.routeId, routeId));
    }
    
    const hops = await db.select()
        .from(hopsSchema)
        .where(and(...conditions))
        .orderBy(asc(hopsSchema.scheduledAt), asc(hopsSchema.hopIndex));
    
    return hops;
}

// Get executed hops ordered by execution time
const getExecutedHops = async (routeId?: number): Promise<Hop[]> => {
    const conditions = [lte(hopsSchema.executedAt, new Date())];
    if (routeId) {
        conditions.push(eq(hopsSchema.routeId, routeId));
    }
    
    const hops = await db.select()
        .from(hopsSchema)
        .where(and(...conditions))
        .orderBy(asc(hopsSchema.executedAt));
    
    return hops;
}

// Get hops scheduled to execute within a time range
const getHopsInTimeRange = async (startTime: Date, endTime: Date, routeId?: number): Promise<Hop[]> => {
    const conditions = [
        lte(hopsSchema.scheduledAt, endTime),
        lte(hopsSchema.scheduledAt, startTime)
    ];
    if (routeId) {
        conditions.push(eq(hopsSchema.routeId, routeId));
    }
    
    const hops = await db.select()
        .from(hopsSchema)
        .where(and(...conditions))
        .orderBy(asc(hopsSchema.scheduledAt));
    
    return hops;
}

// Get overdue hops (scheduled time has passed but not executed)
const getOverdueHops = async (currentTime?: Date, routeId?: number): Promise<Hop[]> => {
    const checkTime = currentTime ? toUtc(currentTime) : utcNow();
    console.log('checkTime', checkTime.toISOString());
    const conditions = [
        lte(hopsSchema.scheduledAt, checkTime),
        isNull(hopsSchema.txHash),
        // Only include hops from deployed routes
        eq(routesSchema.status, 'deployed')
    ];
    if (routeId) {
        conditions.push(eq(hopsSchema.routeId, routeId));
    }
    
    const hops = await db.select({
        id: hopsSchema.id,
        routeId: hopsSchema.routeId,
        hopIndex: hopsSchema.hopIndex,
        recipient: hopsSchema.recipient,
        scheduledAt: hopsSchema.scheduledAt,
        executedAt: hopsSchema.executedAt,
        txHash: hopsSchema.txHash,
        error: hopsSchema.error,
        createdAt: hopsSchema.createdAt,
        updatedAt: hopsSchema.updatedAt,
    })
        .from(hopsSchema)
        .innerJoin(routesSchema, eq(hopsSchema.routeId, routesSchema.id))
        .where(and(...conditions))
        .orderBy(asc(hopsSchema.scheduledAt));
    
    return hops;
}

export const hopsService = {
    getHopsByRoute,
    getHopByRouteAndIndex,
    createHopsForRoute,
    updateHopExecution,
    updateHopSchedule,
    deleteHopsForRoute,
    getPendingHops,
    getExecutedHops,
    getHopsInTimeRange,
    getOverdueHops,
}