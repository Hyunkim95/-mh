import { db, NewTokenConfig, TokenConfig, tokenConfigsSchema } from "../../db";
import { eq, ilike, inArray } from "drizzle-orm";

const create = async (tokenConfig: NewTokenConfig) => {
  return await db.insert(tokenConfigsSchema).values(tokenConfig).returning();
};

const hasPair = async (tokenConfig: TokenConfig) => {
  const configs = await db
    .select()
    .from(tokenConfigsSchema)
    .where(eq(tokenConfigsSchema.pairAddress, tokenConfig.pairAddress))
    .limit(1);
  return configs.length > 0;
};

const findByCreator = async (creator: string) => {
  return await db
    .select()
    .from(tokenConfigsSchema)
    .where(ilike(tokenConfigsSchema.creator, `%${creator}%`));
};

const findIn = async (mints: string[]) => {
  return await db
    .select()
    .from(tokenConfigsSchema)
    .where(
      inArray(
        tokenConfigsSchema.tokenMint,
        mints.map((m) => `%${m.toLowerCase()}%`)
      )
    );
};

export const tokenConfigsService = {
  create,
  hasPair,
  findByCreator,
  findIn,
};
