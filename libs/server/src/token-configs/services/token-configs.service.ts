import { db, NewTokenConfig, TokenConfig, tokenConfigsSchema } from '../../db';
import { eq } from 'drizzle-orm';

const create = async (tokenConfig: NewTokenConfig) => {
    return await db.insert(tokenConfigsSchema).values(tokenConfig).returning();
};

const hasPair = async (tokenConfig: TokenConfig) => {
    const configs = await db.select().from(tokenConfigsSchema).where(eq(tokenConfigsSchema.address, tokenConfig.address)).limit(1);
    return configs.length > 0;
};

export const tokenConfigsService = {
    create,
    hasPair,
};