import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';
import { 
  initializeCompleteTokenConfig, 
  initializeCompleteSolTokenConfig, 
  serialize,
  getTokenConfigSPL,
  getTokenConfigSOL,
  creatorUser,
  signAndSerialize,
  initializeRouteWithWrap,
  initializeRouteSolWithWrap,
  getRouteConfiguration,
  getRouteStateAccount,
  executeHop,
  params
} from '../solana/contract.service';
import { Connection, PublicKey, Keypair, clusterApiUrl } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import executorService from '../executors/executor.service';

// Program IDs
const MULTI_HOPPER_PROGRAM_ID = new PublicKey("DzM2xPUErizCjWTHyWTFqWtSgVazcfFVAGiehoRsG8os");

// Input validation schemas
const publicKeySchema = z.string().min(32).max(44).regex(/^[A-Za-z0-9]+$/, 'Invalid public key format');

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
  splMint: publicKeySchema,
  creator: publicKeySchema,
  tokenConfig: tokenConfigSchema,
});

const initializeTokenConfigSolInputSchema = z.object({
  creator: publicKeySchema,
  tokenConfig: tokenConfigSchema,
});

const getTokenConfigInputSchema = z.object({
  splMint: publicKeySchema,
  creator: publicKeySchema,
});

const getTokenConfigSolInputSchema = z.object({
  creator: publicKeySchema,
});

// Route validation schemas
const hopSchema = z.object({
  recipient: publicKeySchema,
  delaySeconds: z.string(),
});

const initializeRouteInputSchema = z.object({
  routeId: z.number(),
  splMint: publicKeySchema,
  creator: publicKeySchema,
  hopAmount: z.string(),
  routes: z.array(hopSchema)
});

const initializeRouteSolInputSchema = z.object({
  routeId: z.number(),
  creator: publicKeySchema,
  hopAmount: z.string(),
  routes: z.array(hopSchema),
  splMint: publicKeySchema,
});

const getRouteConfigInputSchema = z.object({
  routeId: z.number()
});

const getRouteStateInputSchema = z.object({
  routeId: z.number()
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
    feeBps: new BN(tokenConfig.feeBps),
    feeTreasury: new PublicKey(tokenConfig.feeTreasury),
    maxHops: new BN(tokenConfig.maxHops),
    maxDelaySeconds: new BN(tokenConfig.maxDelaySeconds),
    timelockSeconds: new BN(tokenConfig.timelockSeconds),
    flatFeeLamports: new BN(tokenConfig.flatFeeLamports),
  };
};

// Helper to parse hops from input
const parseHops = (hops: z.infer<typeof hopSchema>[]) => {
  return hops.map(hop => ({
    recipient: new PublicKey(hop.recipient),
    delaySeconds: new BN(hop.delaySeconds),
  }));
};

// Helper to get connection and params
const getConnectionParams = (payer: PublicKey) => {
  return {
    connection: new Connection(clusterApiUrl('devnet'), 'finalized'),
    payer,
    programId: MULTI_HOPPER_PROGRAM_ID,
  };
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
        const { splMint, tokenConfig, creator } = input;
        const tokenMint = new PublicKey(splMint);
        const payer = new PublicKey(creator);
        const parsedConfig = parseTokenConfig(tokenConfig);
        
        const tokenPairMint = Keypair.generate();
        const { transaction } = await initializeCompleteTokenConfig(
          payer,
          tokenMint,
          tokenPairMint,
          parsedConfig
        );
        
        const serializedTransaction = await signAndSerialize(transaction, payer, tokenPairMint, params.connection);
        // const signature = await sendAndConfirmTransaction(params.connection, transaction, [creatorUser]);
        return {
          success: true,
          data: {
            transaction: serializedTransaction,
            tokenPairMint: tokenPairMint.publicKey.toBase58(),
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to initialize token config',
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
        
        const { transaction, wsolMint } = await initializeCompleteSolTokenConfig(
          creatorKey,
          parsedConfig
        );
        
        const serializedTransaction = await signAndSerialize(transaction, creatorKey, wsolMint, params.connection);
        
        return {
          success: true,
          data: {
            transaction: serializedTransaction,
            wsolMint: wsolMint.publicKey.toBase58(),
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to initialize SOL token config',
        });
      }
    }),

  /**
   * Get token config for SPL token
   * GET /contract/get-token-config-spl
   */
  getTokenConfigSPL: publicProcedure
    .input(getTokenConfigInputSchema)
    .query(async ({ input }) => {
      try {
        const { splMint, creator } = input;
        const result = await getTokenConfigSPL(splMint, creator);
        
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get SPL token config',
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
        const result = await getTokenConfigSOL(creator);
        
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get SOL token config',
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
        const { routeId, routes } = input;
        const creatorKey = new PublicKey(input.creator);
        const parsedHops = parseHops(routes);
        
        const transaction = await initializeRouteWithWrap(
          creatorKey,
          creatorKey,
          new BN(routeId),
          new BN(input.hopAmount),
          parsedHops,
          input.splMint,
          TOKEN_PROGRAM_ID
        );
        
        // Get executor keypair for signing since we're now triggering the first hop
        const executorWallet = executorService.getWalletByRouteId(routeId);
        const serializedTransaction = await signAndSerialize(transaction, creatorKey, executorWallet, params.connection);
        
        return {
          success: true,
          data: {
            transaction: serializedTransaction,
            routeId: routeId.toString(),
            executorPublicKey: executorService.getExecutorPublicKey(routeId),
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to initialize route',
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
        const { routeId, routes, hopAmount, } = input;
        const creatorKey = new PublicKey(input.creator);
        const parsedHops = parseHops(routes);
        
        const transaction = await initializeRouteSolWithWrap(
          creatorKey,
          new BN(routeId),
          new BN(hopAmount),
          parsedHops
        );
        
        // Get executor keypair for signing since we're now triggering the first hop
        const executorWallet = executorService.getWalletByRouteId(routeId);
        const serializedTransaction = await signAndSerialize(transaction, creatorKey, executorWallet, params.connection);
        
        return {
          success: true,
          data: {
            transaction: serializedTransaction,
            routeId: routeId.toString(),
            executorPublicKey: executorService.getExecutorPublicKey(routeId),
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to initialize SOL route',
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
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get route configuration',
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
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get route state',
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
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get executor info',
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
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get executor balance',
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
        
        const signature = await executorService.withdrawOnBehalf(routeId, to, amountBN);
        
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
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to withdraw on behalf',
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
        const { routeId, creator, splMint } = input;
        
        // Execute the hop using the simplified signature
        const signature = await executeHop(
          new PublicKey(creator),
          new BN(routeId),
          new PublicKey(splMint)
        );
        
        return {
          success: true,
          data: {
            signature,
            routeId,
          },
        };
      } catch (error) {
        console.error('Trigger hop error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to trigger hop',
        });
      }
    }),
});