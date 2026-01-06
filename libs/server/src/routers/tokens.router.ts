import { z } from "zod";
import { adminProcedure, router } from "../trpc";
import { tokensService } from "../solana/services/tokens.service";

export const tokensRouter = router({
  getTokenAccounts: adminProcedure.query(async ({ ctx }) => {
    const queryUser = ctx.user?.publicKey;
    return await tokensService.getTokensAccountsWithCache(
      queryUser,
      process.env.HELIUS_API
    );
  }),
  crossSectionWithTokenConfigs: adminProcedure.query(async ({ ctx }) => {
    const queryUser = ctx.user?.publicKey;
    return await tokensService.crossSectionWithTokenConfigs(
      queryUser,
      process.env.HELIUS_API
    );
  }),
  getTokenPrice: adminProcedure
    .input(z.string().min(1))
    .query(async ({ input }) => {
      return await tokensService.getTokenPrice(
        input,
        process.env.HELIUS_API
      );
    }),
});
