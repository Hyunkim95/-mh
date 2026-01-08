import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import contractService, {
  routeHasHops,
  initializeCompleteTokenConfig,
  initializeCompleteSolTokenConfig,
  updateTokenConfigWithTransaction,
  updateSolTokenConfigWithTransaction,
  getTokenConfigSPL,
  getTokenConfigSOL,
  signAndSerialize,
  initializeRouteWithWrap,
  initializeRouteSolWithWrap,
  getRouteConfiguration,
  getRouteStateAccount,
  executeHop,
  params,
  serialize,
} from "../solana/services/contract.service";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import executorService from "../executors/executor.service";

// Input validation schemas
const publicKeySchema = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[A-Za-z0-9]+$/, "Invalid public key format");

const tokenConfigSchema = z.object({
  minTransfer: z.string(),
  feeBps: z.string(),
  feeTreasury: z.string(),
  maxHops: z.string(),
  maxDelaySeconds: z.string(),
  timelockSeconds: z.string(),
  flatFeeLamports: z.string(),
});

const initializeTokenConfigInputSchema = z.object({
  creator: publicKeySchema,
  tokenConfig: tokenConfigSchema,
});

const addHopsInputSchema = z.object({
  routeId: z.number(),
  creator: publicKeySchema,
  hops: z.array(
    z.object({
      recipient: publicKeySchema,
      scheduledAt: z.number(),
    })
  ),
});

const initializeTokenConfigSolInputSchema = z.object({
  creator: publicKeySchema,
  tokenConfig: tokenConfigSchema,
});

const updateTokenConfigInputSchema = z.object({
  creator: publicKeySchema,
  tokenConfig: tokenConfigSchema,
});

const updateTokenConfigSolInputSchema = z.object({
  creator: publicKeySchema,
  tokenConfig: tokenConfigSchema,
});

const getTokenConfigSolInputSchema = z.object({
  creator: publicKeySchema,
});

// Route validation schemas
const hopSchema = z.object({
  recipient: publicKeySchema,
  scheduledAt: z.number()
});

const initializeRouteInputSchema = z.object({
  routeId: z.number(),
  splMint: publicKeySchema,
  creator: publicKeySchema,
  hopAmount: z.string(),
  hops: z.array(hopSchema),
});

const initializeRouteSolInputSchema = z.object({
  routeId: z.number(),
  creator: publicKeySchema,
  hopAmount: z.string(),
  hops: z.array(hopSchema),
  splMint: publicKeySchema,
});

const getRouteConfigInputSchema = z.object({
  routeId: z.number(),
});

const getRouteStateInputSchema = z.object({
  routeId: z.number(),
});

// Executor operation schemas
const getExecutorInfoInputSchema = z.object({
  routeId: z.number(),
});

const getExecutorBalanceInputSchema = z.object({
  routeId: z.number(),
});

const withdrawOnBehalfInputSchema = z.object({
  routeId: z.number(),
  to: publicKeySchema,
  amount: z.string(),
});

const triggerHopInputSchema = z.object({
  routeId: z.number(),
  creator: publicKeySchema,
  splMint: publicKeySchema,
});

// Helper to convert string values to BN and PublicKey for TokenConfig
const parseTokenConfig = (tokenConfig: z.infer<typeof tokenConfigSchema>) => {
  return {
    minTransfer: new BN(tokenConfig.minTransfer),
    feeBps: Number(tokenConfig.feeBps),
    feeTreasury: new PublicKey(tokenConfig.feeTreasury),
    maxHops: Number(tokenConfig.maxHops),
    maxDelaySeconds: new BN(tokenConfig.maxDelaySeconds),
    timelockSeconds: new BN(tokenConfig.timelockSeconds),
    flatFeeLamports: new BN(tokenConfig.flatFeeLamports),
  };
};

// Helper to parse hops from input
const parseHops = (hops: z.infer<typeof hopSchema>[]) => {
  return hops.map((hop) => ({
    recipient: new PublicKey(hop.recipient),
    executeAt: new BN(Math.floor(new Date(hop.scheduledAt).getTime() / 1000)), // Convert to Unix timestamp
  }));
};

export const contractRouter = router({
  /**
   * Initialize token config for SPL token
   * POST /contract/initialize-token-config
   */
  initializeTokenConfig: publicProcedure
    .input(initializeTokenConfigInputSchema)
    .mutation(async ({ input }) => {
      try {
        const { tokenConfig, creator } = input;
        const payer = new PublicKey(creator);
        const parsedConfig = parseTokenConfig(tokenConfig);

        const { transaction } = await initializeCompleteTokenConfig(
          payer,
          parsedConfig
        );

        const serializedTransaction = await serialize(
          transaction,
          payer,
          params.connection
        );
        return {
          success: true,
          data: {
            ...serializedTransaction
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to initialize token config",
        });
      }
    }),

  /**
   * Initialize token config for SOL
   * POST /contract/initialize-token-config-sol
   */
  initializeTokenConfigSOL: publicProcedure
    .input(initializeTokenConfigSolInputSchema)
    .mutation(async ({ input }) => {
      try {
        const { creator, tokenConfig } = input;
        const creatorKey = new PublicKey(creator);
        const parsedConfig = parseTokenConfig(tokenConfig);

        const { transaction } =
          await initializeCompleteSolTokenConfig(creatorKey, parsedConfig);

        const serializedTransaction = await serialize(
          transaction,
          creatorKey,
          params.connection
        );

        return {
          success: true,
          data: {
            ...serializedTransaction
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to initialize SOL token config",
        });
      }
    }),

  /**
   * Update token config for SPL token
   * POST /contract/update-token-config
   */
  updateTokenConfig: publicProcedure
    .input(updateTokenConfigInputSchema)
    .mutation(async ({ input }) => {
      try {
        const { tokenConfig, creator } = input;
        const payer = new PublicKey(creator);
        const parsedConfig = parseTokenConfig(tokenConfig);

        const transaction = await updateTokenConfigWithTransaction(
          payer,
          parsedConfig
        );
        const signer = executorService.getSigner();

        const serializedTransaction = await signAndSerialize(
          transaction,
          payer,
          signer,
          params.connection
        );

        return {
          success: true,
          data: {
            ...serializedTransaction,
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to update token config",
        });
      }
    }),

  /**
   * Update token config for SOL
   * POST /contract/update-token-config-sol
   */
  updateTokenConfigSOL: publicProcedure
    .input(updateTokenConfigSolInputSchema)
    .mutation(async ({ input }) => {
      try {
        const { creator, tokenConfig } = input;
        const creatorKey = new PublicKey(creator);
        const parsedConfig = parseTokenConfig(tokenConfig);

        const transaction = await updateSolTokenConfigWithTransaction(
          creatorKey,
          parsedConfig
        );

        const serializedTransaction = await serialize(
          transaction,
          creatorKey,
          params.connection
        );

        return {
          success: true,
          data: {
            ...serializedTransaction,
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to update SOL token config",
        });
      }
    }),

  /**
   * Get token config for SPL token
   * GET /contract/get-token-config-spl
   */
  getTokenConfigSPL: publicProcedure
    .query(async () => {
      try {
        const result = await getTokenConfigSPL();

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get SPL token config",
        });
      }
    }),

  /**
   * Get token config for SOL
   * GET /contract/get-token-config-sol
   */
  getTokenConfigSOL: publicProcedure
    .input(getTokenConfigSolInputSchema)
    .query(async ({ input }) => {
      try {
        const { creator } = input;
        const result = await getTokenConfigSOL();

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get SOL token config",
        });
      }
    }),

  /**
   * Initialize route for SPL token
   * POST /contract/initialize-route
   */
  initializeRoute: publicProcedure
    .input(initializeRouteInputSchema)
    .mutation(async ({ input }) => {
      try {
        const { routeId, hops } = input;
        const creatorKey = new PublicKey(input.creator);
        const parsedHops = parseHops(hops);

        const {
          transaction,
          wrappedToken
        } = await initializeRouteWithWrap(
          creatorKey,
          creatorKey,
          new BN(routeId),
          new BN(input.hopAmount),
          parsedHops,
          input.splMint,
          TOKEN_PROGRAM_ID
        );

        const serializedTransaction = await signAndSerialize(
          transaction,
          creatorKey,
          wrappedToken,
          params.connection
        )

        return {
          success: true,
          data: {
            ...serializedTransaction,
            routeId: routeId.toString(),
            executorPublicKey: executorService.getExecutorPublicKey(routeId),
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to initialize route",
        });
      }
    }),

  /**
   * Initialize route for SOL
   * POST /contract/initialize-route-sol
   */
  initializeRouteSOL: publicProcedure
    .input(initializeRouteSolInputSchema)
    .mutation(async ({ input }) => {
      try {
        const { routeId, hops, hopAmount } = input;
        const creatorKey = new PublicKey(input.creator);
        const parsedHops = parseHops(hops);

        const {
          transaction,
          wrappedToken
        } = await initializeRouteSolWithWrap(
          creatorKey,
          new BN(routeId),
          new BN(hopAmount),
          parsedHops
        );

        const serializedTransaction = await signAndSerialize(
          transaction,
          creatorKey,
          wrappedToken,
          params.connection
        );

        return {
          success: true,
          data: {
            ...serializedTransaction,
            routeId: routeId.toString(),
            executorPublicKey: executorService.getExecutorPublicKey(routeId),
          },
        };
      } catch (error) {
        console.error("Failed to initialize SOL route:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to initialize SOL route",
        });
      }
    }),

  routeHasHops: publicProcedure
    .input(z.object({ routeId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const result = await routeHasHops(input.routeId);
        return {
          success: true,
          data: {
            routeId: input.routeId,
            ...result,
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to check if route has hops",
        });
      }
    }),
  
  addHops: publicProcedure
    .input(addHopsInputSchema)
    .mutation(async ({
      input
    }) => {
      try {
        const { routeId, creator, hops } = input;
        const parsedHops = parseHops(hops);
        const creatorKey = new PublicKey(creator);

        const result = await contractService.addHops(
          creatorKey,
          new BN(routeId),
          parsedHops
        );

        const serialized = await serialize(
          result,
          new PublicKey(creator),
          params.connection
        );

        return {
          success: true,
          data: serialized,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to add hops",
        });
      }
    }),

  /**
   * Get route configuration
   * GET /contract/get-route-config
   */
  getRouteConfig: publicProcedure
    .input(getRouteConfigInputSchema)
    .query(async ({ input }) => {
      try {
        const { routeId } = input;

        const result = await getRouteConfiguration(routeId);

        if (!result) {
          return {
            success: false,
            data: null,
          };
        }

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get route configuration",
        });
      }
    }),

  /**
   * Get route state
   * GET /contract/get-route-state
   */
  getRouteState: publicProcedure
    .input(getRouteStateInputSchema)
    .query(async ({ input }) => {
      try {
        const { routeId } = input;
        const result = await getRouteStateAccount(routeId);

        if (!result) {
          return {
            success: false,
            data: null,
          };
        }

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get route state",
        });
      }
    }),

  /**
   * Get executor public key for a route
   * GET /contract/get-executor-info
   */
  getExecutorInfo: publicProcedure
    .input(getExecutorInfoInputSchema)
    .query(async ({ input }) => {
      try {
        const { routeId } = input;
        const publicKey = executorService.getExecutorPublicKey(routeId);

        return {
          success: true,
          data: {
            routeId,
            publicKey,
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get executor info",
        });
      }
    }),

  /**
   * Get executor balance for a route
   * GET /contract/get-executor-balance
   */
  getExecutorBalance: publicProcedure
    .input(getExecutorBalanceInputSchema)
    .query(async ({ input }) => {
      try {
        const { routeId } = input;
        const balance = await executorService.balance(routeId);

        return {
          success: true,
          data: {
            routeId,
            balance: balance.toString(),
            balanceSOL: (balance.toNumber() / 1e9).toFixed(9), // Convert lamports to SOL
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get executor balance",
        });
      }
    }),

  /**
   * Withdraw funds from executor wallet
   * POST /contract/withdraw-on-behalf
   */
  withdrawOnBehalf: publicProcedure
    .input(withdrawOnBehalfInputSchema)
    .mutation(async ({ input }) => {
      try {
        const { routeId, to, amount } = input;
        const amountBN = new BN(amount);

        const signature = await executorService.withdrawOnBehalf(
          routeId,
          to,
          amountBN
        );

        return {
          success: true,
          data: {
            signature,
            routeId,
            to,
            amount: amount,
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to withdraw on behalf",
        });
      }
    }),

  /**
   * Trigger next hop for a route
   * POST /contract/trigger-hop
   */
  triggerHop: publicProcedure
    .input(triggerHopInputSchema)
    .mutation(async ({ input }) => {
      try {
        const { routeId, creator } = input;

        // Execute the hop using the simplified signature
        const signature = await executeHop(
          new PublicKey(creator),
          new BN(routeId),
        );

        return {
          success: true,
          data: {
            signature,
            routeId,
          },
        };
      } catch (error) {
        console.error("Trigger hop error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to trigger hop",
        });
      }
    }),
});
