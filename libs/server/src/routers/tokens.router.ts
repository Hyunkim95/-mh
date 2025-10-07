import { adminProcedure, router } from "../trpc";
import { tokensService } from "../solana/services/tokens.service";

export const tokensRouter = router({
  getTokenAccounts: adminProcedure.query(async ({ ctx }) => {
    const queryUser = "4jLPFoW7at66h6WhyCZmcskpn3jgR1uQ9CJdTLfe9hVH";
    return await tokensService.getTokensAccountsWithCache(queryUser);
  }),
  crossSectionWithTokenConfigs: adminProcedure.query(async ({ ctx }) => {
    const queryUser = "4jLPFoW7at66h6WhyCZmcskpn3jgR1uQ9CJdTLfe9hVH";
    return await tokensService.crossSectionWithTokenConfigs(queryUser);
  }),
});
