import { db, hopsSchema } from "../../db";
import { and, asc, eq, lte } from "drizzle-orm";


const getNextExecutableHops = async (date: Date) => {
    const hops = await db.select()
        .from(hopsSchema)
        .where(and(eq(hopsSchema.isReady, true), lte(hopsSchema.executesAt, date)))
        .orderBy(asc(hopsSchema.executesAt))
    return hops;
}

const markNextHopAsReady = async (routeId: number, currentIndex: number) => {
    const hop = await db.update(hopsSchema)
        .set({ isReady: true })
        .where(
            and(
                eq(hopsSchema.routeId, routeId),
                eq(hopsSchema.index, currentIndex + 1)
            )
        )
        .returning();
    return hop;
}


export const hopsService = {
    getNextExecutableHops,
    markNextHopAsReady,
}