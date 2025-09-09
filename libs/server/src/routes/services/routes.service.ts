import { db, NewHop, NewRoute, hopsSchema, routesSchema } from "../../db";
import { eq } from "drizzle-orm";
import executorService from "../../executors/executor.service";

const cascadeCreate = async (
    _route: NewRoute,
    _hops: NewHop[]
) => {
    return db.transaction(async (tx) => {
        const route = await tx.insert(routesSchema).values(_route).returning();
        const hops = await tx.insert(hopsSchema).values(_hops.map(hop => ({ ...hop, routeId: route[0].id }))).returning();
        return { route, hops };
    });
}

const triggerNextHop = async (routeId: number) => {}

export const routesService = {
    cascadeCreate,
    triggerNextHop
}