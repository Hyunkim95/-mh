import { tokenConfigsService } from "../token-configs/services/token-configs.service";

import { adminProcedure, router } from "../trpc";

export const tokenConfigsRouter = router({
  getTokenConfigs: adminProcedure.query(async ({ ctx }) => {
    return await tokenConfigsService.findByCreator(ctx.user.publicKey);
  }),
});
