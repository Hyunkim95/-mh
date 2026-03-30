import { tokenConfigsService } from "../token-configs/services/token-configs.service";

import { adminProcedure, router } from "../trpc";
import { z } from "zod";

export const tokenConfigsRouter = router({
  getTokenConfigs: adminProcedure.query(async ({ ctx }) => {
    return await tokenConfigsService.findByCreator(ctx.user.publicKey);
  }),
  getTokenConfigById: adminProcedure
    .input(z.number())
    .query(async ({ input }) => {
      return await tokenConfigsService.findById(input);
    }),
});
