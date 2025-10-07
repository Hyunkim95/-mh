import { adminProcedure, router } from "../trpc";
import { tokensService } from "../solana/services/tokens.service";

const internalCache = new Map<string, any>();
const userToTimestamp = new Map<string, number>();

export const tokensRouter = router({
  getTokenAccounts: adminProcedure.query(async ({ ctx }) => {
    const queryUser = "4jLPFoW7at66h6WhyCZmcskpn3jgR1uQ9CJdTLfe9hVH";
    const now = Date.now();
    const cacheTime = userToTimestamp.get(queryUser);
    if (internalCache.has(queryUser) && cacheTime && cacheTime > now) {
      return internalCache.get(queryUser);
    }
    userToTimestamp.set(queryUser, now + 1000 * 60 * 5);
    const tokens = await tokensService.getTokenAccounts(queryUser);
    internalCache.set(queryUser, tokens);
    return await tokensService.getTokenAccounts(queryUser);
  }),
});
