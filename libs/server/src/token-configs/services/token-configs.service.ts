import { db, NewTokenConfig, TokenConfig, tokenConfigsSchema } from "../../db";
import { eq, ilike, inArray } from "drizzle-orm";

const create = async (tokenConfig: NewTokenConfig) => {
  return await db
    .insert(tokenConfigsSchema)
    .values(tokenConfig)
    .onConflictDoUpdate({
      target: [tokenConfigsSchema.tokenConfigAddress],
      set: tokenConfig,
    })
    .returning();
};

const findById = async (id: number) => {
  const config = await db
    .select()
    .from(tokenConfigsSchema)
    .where(eq(tokenConfigsSchema.id, id));

  if (config.length === 0) {
    return null;
  }

  return config[0];
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
    .where(inArray(tokenConfigsSchema.tokenMint, mints));
};

const update = async (
  tokenConfigAddress: string,
  tokenConfig: Partial<TokenConfig>
) => {
  return await db
    .update(tokenConfigsSchema)
    .set(tokenConfig)
    .where(ilike(tokenConfigsSchema.tokenConfigAddress, tokenConfigAddress));
};

export const tokenConfigsService = {
  create,
  hasPair,
  findByCreator,
  findIn,
  findById,
  update,
};
