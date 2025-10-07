import { protectedProcedure, publicProcedure, router } from "../trpc";
import { usersService } from "../auth/services/users.service";
import { authService } from "../auth/services/auth.service";
import { authInputSchema } from "./inputs/auth";
import { TRPCError } from "@trpc/server";

export const authRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    return ctx.user;
  }),

  createMessage: publicProcedure.mutation(async () => {
    return await authService.createChallenge();
  }),

  verifyUserWithSignature: publicProcedure
    .input(authInputSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await usersService.verifyUserWithSignature(
        input.nonce,
        input.address,
        input.signature,
        input.isHardwareWallet
      );
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const token = ctx.fastify.jwt.sign({
        userId: user.id,
        role: user.role,
        expiresIn: "1d",
        publicKey: user.publicKey,
      });
      return { token };
    }),
});
