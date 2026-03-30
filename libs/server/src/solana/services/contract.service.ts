import {
  Transaction,
  PublicKey,
  Connection,
  SystemProgram,
  Keypair,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from "@solana/web3.js";
import { Program, AnchorProvider, utils, BN } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddress,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { MultiHopperProject } from "../idl/multi_hopper_project";
import { TransferHookGuard } from "../idl/transfer_hook_guard";
import * as IDLJson from "../idl/multi_hopper_project.json";
import * as GuardIDLJson from "../idl/transfer_hook_guard.json";
import bs58 from "bs58";
import executorService from "../../executors/executor.service";
import { fetchTokenMetadata } from "@libs/solana-node";
import { config } from "../../config/config";
import { createLogger } from "@libs/logger";

const log = createLogger("ContractService");

const solToLamports = (sol: number) => {
  return sol * LAMPORTS_PER_SOL;
};
// ComputeBudget Program ID
const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey(
  "ComputeBudget111111111111111111111111111111",
);

/**
 * Creates a prioritization fee instruction to increase transaction priority
 * @param priorityFeeMicroLamports - Priority fee in micro-lamports (1 lamport = 1,000,000 micro-lamports)
 * @returns TransactionInstruction for setting priority fee
 */
export const createPriorityFeeInstruction = (
  priorityFeeMicroLamports: number,
) => {
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0); // SetComputeUnitPrice instruction discriminator
  data.writeBigUInt64LE(BigInt(priorityFeeMicroLamports), 1);

  return new TransactionInstruction({
    keys: [],
    programId: COMPUTE_BUDGET_PROGRAM_ID,
    data,
  });
};

/**
 * Creates a compute unit limit instruction to set maximum compute units for transaction
 * @param computeUnits - Maximum compute units (typical range: 200,000 - 1,400,000)
 * @returns TransactionInstruction for setting compute unit limit
 */
export const createComputeUnitLimitInstruction = (computeUnits: number) => {
  const data = Buffer.alloc(5);
  data.writeUInt8(2, 0); // SetComputeUnitLimit instruction discriminator
  data.writeUInt32LE(computeUnits, 1);

  return new TransactionInstruction({
    keys: [],
    programId: COMPUTE_BUDGET_PROGRAM_ID,
    data,
  });
};

/**
 * Helper to calculate priority fee in micro-lamports from SOL amount
 * @param priorityFeeSol - Priority fee in SOL
 * @returns Priority fee in micro-lamports
 */
export const solToPriorityFeeMicroLamports = (
  priorityFeeSol: number,
): number => {
  return Math.floor(priorityFeeSol * LAMPORTS_PER_SOL * 1_000_000);
};

/**
 * Creates priority instructions with dynamically calculated fees
 * @param connection - Solana connection instance
 * @param computeUnits - Maximum compute units
 * @param accounts - Optional array of account addresses for targeted fee calculation
 * @param percentile - Percentile to use for fee calculation (default: 75th percentile)
 * @returns Promise<Array> - Array of ComputeBudgetInstructions
 */
export const createDynamicPriorityInstructions = async (
  connection: Connection,
  computeUnits: number = 400_000,
  accounts?: PublicKey[],
  percentile: number = 75,
) => {
  const recommendedFee = await getRecommendedPriorityFee(
    connection,
    accounts,
    percentile,
  );

  return [
    createComputeUnitLimitInstruction(computeUnits),
    createPriorityFeeInstruction(recommendedFee),
  ];
};

/**
 * Gets recent prioritization fees from the network and calculates recommended fee
 * @param connection - Solana connection instance
 * @param accounts - Optional array of account addresses to get fees for specific accounts
 * @param percentile - Percentile to use for fee calculation (default: 75th percentile)
 * @returns Promise<number> - Recommended priority fee in micro-lamports
 */
export const getRecommendedPriorityFee = async (
  connection: Connection,
  accounts?: PublicKey[],
  percentile: number = 75,
): Promise<number> => {
  try {
    const recentFees = await connection.getRecentPrioritizationFees({
      lockedWritableAccounts: accounts,
    });

    if (recentFees.length === 0) {
      // Default fallback fee if no recent fees available
      return 1000; // 0.001 lamports per compute unit
    }

    // Sort fees by prioritization fee
    const sortedFees = recentFees
      .map((fee) => fee.prioritizationFee)
      .sort((a, b) => a - b);

    // Calculate percentile index
    const index = Math.ceil((percentile / 100) * sortedFees.length) - 1;
    const recommendedFee = sortedFees[Math.max(0, index)];

    // Ensure minimum fee of 1 micro-lamport
    return Math.max(1000, recommendedFee);
  } catch (error) {
    log.warn("Failed to get recent prioritization fees:", error);
    // Fallback to default fee
    return 1000;
  }
};

const IDL = IDLJson as any;
const GUARD_IDL = GuardIDLJson as any;

// Program IDs
const MULTI_HOPPER_PROGRAM_ID = new PublicKey(IDLJson.address);
const TRANSFER_HOOK_GUARD_PROGRAM_ID = new PublicKey(GuardIDLJson.address);

interface TokenConfig {
  minTransfer: BN;
  feeBps: number;
  feeTreasury: PublicKey;
  maxHops: number;
  maxDelaySeconds: BN;
  timelockSeconds: BN;
  flatFeeLamports: BN;
}

interface SolanaInstructionParams {
  connection: Connection;
  programId: PublicKey;
}

// Helper function to get guard PDA
export const getGuardPda = (tokenMint: PublicKey): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("guard"), tokenMint.toBuffer()],
    TRANSFER_HOOK_GUARD_PROGRAM_ID,
  );
};

interface IHop {
  recipient: PublicKey;
  executeAt: BN;
}

export const params = {
  connection: new Connection(config.solanaRpcUrl || ""),
  programId: MULTI_HOPPER_PROGRAM_ID,
};

// Cache program instances to avoid memory leaks from repeated instantiation
let cachedProgram: Program<MultiHopperProject> | null = null;
let cachedGuardProgram: Program<TransferHookGuard> | null = null;

const buildProgram = (params: SolanaInstructionParams) => {
  if (!cachedProgram) {
    cachedProgram = new Program<MultiHopperProject>(
      IDL as any,
      new AnchorProvider(params.connection, {} as any, {}),
    );
  }
  return cachedProgram;
};

const buildGuardProgram = (params: SolanaInstructionParams) => {
  if (!cachedGuardProgram) {
    cachedGuardProgram = new Program<TransferHookGuard>(
      GUARD_IDL as any,
      new AnchorProvider(params.connection, {} as any, {}),
    );
  }
  return cachedGuardProgram;
};

export const getMintAuthority = async (routeId: BN) => {
  const [mintAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority"), routeId.toArrayLike(Buffer, "le", 8)],
    params.programId,
  );
  return mintAuthority;
};

const initializeTokenConfig = async (
  payer: PublicKey,
  tokenConfig: TokenConfig,
) => {
  const program = buildProgram(params);
  const tokenConfigPda = await getTokenConfigPda();
  const signer = executorService.getSigner();

  return await program.methods
    .initializeTokenConfig(
      tokenConfig.minTransfer,
      tokenConfig.feeBps,
      signer.publicKey,
      tokenConfig.feeTreasury,
      tokenConfig.maxHops,
      tokenConfig.flatFeeLamports,
    )
    .accountsPartial({
      creator: payer,
      tokenConfig: tokenConfigPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
};

const initGuard = async (
  payer: PublicKey,
  tokenMint: PublicKey,
  permanentDelegate: PublicKey,
) => {
  const guardProgram = buildGuardProgram(params);

  const [guardPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("guard"), tokenMint.toBuffer()],
    TRANSFER_HOOK_GUARD_PROGRAM_ID,
  );

  return await guardProgram.methods
    .initGuard(permanentDelegate)
    .accountsPartial({
      payer: payer,
      mint: tokenMint,
      guard: guardPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
};
const initializeExtraAccountMetaList = async (
  payer: PublicKey,
  tokenMint: PublicKey
) => {
  const guardProgram = buildGuardProgram(params);

  const extraAccountMetasPda = getExtraAccountMetasPda(tokenMint);

  return await guardProgram.methods
    .initializeExtraAccountMetaList()
    .accountsPartial({
      payer,
      extraAccountMetas: extraAccountMetasPda,
      mint: tokenMint,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
};

const initGuardSol = async (
  payer: PublicKey,
  wsolMint: PublicKey,
  permanentDelegate: PublicKey,
) => {
  const guardProgram = buildGuardProgram(params);

  const [guardPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("guard"), wsolMint.toBuffer()],
    TRANSFER_HOOK_GUARD_PROGRAM_ID,
  );

  return await guardProgram.methods
    .initGuard(permanentDelegate)
    .accountsPartial({
      payer,
      mint: wsolMint,
      guard: guardPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
};

const wrap = async (
  payer: PublicKey,
  routeId: BN,
  tokenConfigPda: PublicKey,
  originalMint: PublicKey,
  pairMint: PublicKey,
  amount: BN,
) => {
  const program = buildProgram(params);

  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority"), originalMint.toBuffer()],
    params.programId,
  );
  const routeConfig = await getRouteConfigPda(routeId);

  const mintAuthority = await getMintAuthority(routeId);

  const originalFrom = await getAssociatedTokenAddress(originalMint, payer);
  const vault = await getAssociatedTokenAddress(
    originalMint,
    vaultAuthority,
    true,
  );
  const pairTo = await getAssociatedTokenAddress(
    pairMint,
    payer,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  return await program.methods
    .wrap(routeId, amount)
    .accountsPartial({
      payer: payer,
      tokenConfig: tokenConfigPda,
      routeConfig,
      originalMint,
      routeMint: pairMint,
      originalFrom,
      vault,
      vaultAuth: vaultAuthority,
      routeTo: pairTo,
      wrapperMintAuth: mintAuthority,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      originalTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
};
const wrapSol = async (
  payer: PublicKey,
  routeId: BN,
  tokenConfigPda: PublicKey,
  wsolMint: PublicKey,
  amount: BN,
) => {
  const program = buildProgram(params);
  const tokenConfigAccount =
    await program.account.tokenConfig.fetch(tokenConfigPda);
  const routeConfig = await getRouteConfigPda(routeId);

  const mintAuthority = await getMintAuthority(routeId);

  const solVault = await getSolVault(tokenConfigAccount.creator);
  const wsolTo = await getAssociatedTokenAddress(
    wsolMint,
    payer,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  return await program.methods
    .wrapSol(routeId, amount)
    .accountsPartial({
      payer: payer,
      tokenConfig: tokenConfigPda,
      wsolMint,
      wsolTo,
      routeConfig,
      mintAuthority,
      solVault,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
};

// TODO: unwrap can be called by anyone maybe thats a security risk
// TODO: make originaltokenprogram a parameter
export const unwrap = async (
  payer: PublicKey,
  recipient: PublicKey,
  tokenConfigPda: PublicKey,
  originalMint: PublicKey,
  pairMint: PublicKey,
  amount: BN,
  routeId: BN,
) => {
  const program = buildProgram(params);
  const vaultAuthority = await getVaultAuthority(originalMint);
  const permanentDelegate = await getPermanentDelegate(routeId);
  const routeConfigPda = await getRouteConfigPda(routeId);
  const routeStatePda = await getRouteStatePda(routeId);
  // These need to be PDAs according to the IDL, not standard associated token accounts
  const [pairFrom] = PublicKey.findProgramAddressSync(
    [
      recipient.toBuffer(),
      TOKEN_2022_PROGRAM_ID.toBuffer(),
      pairMint.toBuffer(),
    ],
    utils.token.ASSOCIATED_PROGRAM_ID,
  );

  const [originalTo] = PublicKey.findProgramAddressSync(
    [
      recipient.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      originalMint.toBuffer(),
    ],
    utils.token.ASSOCIATED_PROGRAM_ID,
  );

  const [vault] = PublicKey.findProgramAddressSync(
    [
      vaultAuthority.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      originalMint.toBuffer(),
    ],
    utils.token.ASSOCIATED_PROGRAM_ID,
  );

  return await program.methods
    .unwrap(routeId, amount)
    .accountsPartial({
      payer: payer,
      tokenConfig: tokenConfigPda,
      originalMint,
      routeMint: pairMint,
      routeFrom: pairFrom,
      from: recipient,
      originalTo,
      to: recipient,
      vault,
      routeConfig: routeConfigPda,
      routeState: routeStatePda,
      vaultAuth: vaultAuthority,
      permanentDelegate,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      originalTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
};
export const unwrapSol = async (
  payer: PublicKey,
  recipient: PublicKey,
  tokenConfigPda: PublicKey,
  wsolMint: PublicKey,
  amount: BN,
  routeId: BN,
) => {
  const program = buildProgram(params);
  const permanentDelegate = await getPermanentDelegate(routeId);
  const tokenConfigAccount =
    await program.account.tokenConfig.fetch(tokenConfigPda);
  const solVault = await getSolVault(tokenConfigAccount.creator);
  const wsolFrom = await getAssociatedTokenAddress(
    wsolMint,
    recipient,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const routeConfigPda = await getRouteConfigPda(routeId);
  const routeStatePda = await getRouteStatePda(routeId);
  return await program.methods
    .unwrapSol(routeId, amount)
    .accountsPartial({
      payer,
      tokenConfig: tokenConfigPda,
      wsolMint,
      wsolFrom,
      from: recipient,
      to: recipient,
      routeConfig: routeConfigPda,
      routeState: routeStatePda,
      permanentDelegate,
      solVault,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
};

export const getTokenConfigPda = async () => {
  const [tokenConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_config_global")],
    params.programId,
  );
  return tokenConfigPda;
};

export const getRouteConfigPda = async (routeId: BN) => {
  const [routeConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("route"), routeId.toArrayLike(Buffer, "le", 8)],
    params.programId,
  );
  return routeConfigPda;
};

export const getRouteStatePda = async (routeId: BN) => {
  const [routeStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state"), routeId.toArrayLike(Buffer, "le", 8)],
    params.programId,
  );
  return routeStatePda;
};

export const getPermanentDelegate = async (routeId: BN) => {
  const [permanentDelegate] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegate"), routeId.toArrayLike(Buffer, "le", 8)],
    params.programId,
  );
  return permanentDelegate;
};

export const getVaultAuthority = async (originalMint: PublicKey) => {
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority"), originalMint.toBuffer()],
    params.programId,
  );
  return vaultAuthority;
};

export const getSolVault = async (creator: PublicKey) => {
  const [solVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault"), creator.toBuffer()],
    params.programId,
  );
  return solVault;
};

export const getVault = async (
  vaultAuthority: PublicKey,
  originalMint: PublicKey,
) => {
  const [vault] = PublicKey.findProgramAddressSync(
    [
      vaultAuthority.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      originalMint.toBuffer(),
    ],
    utils.token.ASSOCIATED_PROGRAM_ID,
  );
  return vault;
};

// Maximum hops per transaction to stay within Solana's 1,232-byte limit
// Each hop = 40 bytes (32-byte pubkey + 8-byte i64 timestamp)
// Reduced to 3 hops per batch (~320 bytes) to leave room for Phantom's Lighthouse security instructions
// This prevents simulation warnings when batch signing multiple transactions
export const HOPS_PER_BATCH = 3;

export const addHops = async (
  creator: PublicKey,
  routeId: BN,
  hops: IHop[],
) => {
  const program = buildProgram(params);

  const routeConfig = await getRouteConfigPda(routeId);
  const routeState = await getRouteStatePda(routeId);

  const instruction = await program.methods
    .addHops(routeId, hops)
    .accountsPartial({
      creator: creator,
      routeConfig: routeConfig,
      routeState: routeState,
    })
    .instruction();

  const transaction = new Transaction();

  // Add dynamic priority fee instructions
  const priorityInstructions = await createDynamicPriorityInstructions(
    params.connection,
  );
  priorityInstructions.forEach((ix) => transaction.add(ix));

  transaction.add(instruction);

  return transaction;
};

/**
 * Creates multiple transactions to add hops in batches.
 * This avoids Solana's 1,232-byte transaction size limit.
 *
 * @param creator - The route creator's public key
 * @param routeId - The route ID
 * @param hops - All hops to add
 * @returns Array of transactions, one per batch
 */
export const addHopsBatched = async (
  creator: PublicKey,
  routeId: BN,
  hops: IHop[],
): Promise<Transaction[]> => {
  const transactions: Transaction[] = [];

  // Split hops into batches
  for (let i = 0; i < hops.length; i += HOPS_PER_BATCH) {
    const batch = hops.slice(i, i + HOPS_PER_BATCH);
    const transaction = await addHops(creator, routeId, batch);
    transactions.push(transaction);
  }

  return transactions;
};

const initializeRoute = async (
  payer: PublicKey,
  creator: PublicKey,
  tokenConfigPda: PublicKey,
  originalMint: PublicKey,
  wrappedMint: PublicKey,
  routeId: BN,
  executor: PublicKey,
  hopAmount: BN,
  hops: IHop[],
  originalTokenProgram: PublicKey,
) => {
  const program = buildProgram(params);
  const routeConfigPda = await getRouteConfigPda(routeId);
  const routeStatePda = await getRouteStatePda(routeId);

  const originalFrom = await getAssociatedTokenAddress(
    originalMint,
    creator,
    false,
    originalTokenProgram,
  );

  // Get fee treasury from token config
  const tokenConfigAccount =
    await program.account.tokenConfig.fetch(tokenConfigPda);
  const originalTreasuryAccount = await getAssociatedTokenAddress(
    originalMint,
    tokenConfigAccount.feeTreasury as PublicKey,
  );
  const mintAuthority = await getMintAuthority(routeId);
  const permanentDelegate = await getPermanentDelegate(routeId);
  const offchainMetadata = await fetchTokenMetadata(
    params.connection,
    originalMint,
  );
  const uri = offchainMetadata?.uri || "";
  const name = offchainMetadata?.name || "SPL Token";
  const symbol = offchainMetadata?.symbol || "SPL";

  return await program.methods
    .initializeRoute(
      routeId,
      executor,
      hopAmount,
      hops.length,
      name,
      symbol,
      uri,
    )
    .accountsStrict({
      creator: payer,
      tokenConfig: tokenConfigPda,
      routeConfig: routeConfigPda,
      routeState: routeStatePda,
      originalTreasuryAccount,
      originalMint,
      originalFrom,
      routeTokenMint: wrappedMint,
      mintAuthority,
      permanentDelegate,
      feeTreasury: tokenConfigAccount.feeTreasury as PublicKey,
      solTreasury: tokenConfigAccount.feeTreasury as PublicKey,
      originalTokenProgram,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      transferHookGuardProgram: TRANSFER_HOOK_GUARD_PROGRAM_ID,
      associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
};
const initializeRouteSol = async (
  payer: PublicKey,
  tokenConfigPda: PublicKey,
  routeId: BN,
  executor: PublicKey,
  wSolMint: PublicKey,
  hopAmount: BN,
  hops: IHop[],
) => {
  const program = buildProgram(params);
  const routeConfigPda = await getRouteConfigPda(routeId);
  const routeStatePda = await getRouteStatePda(routeId);

  // Get fee treasury from token config
  const tokenConfigAccount =
    await program.account.tokenConfig.fetch(tokenConfigPda);

  const name = "Wrapped SOL";
  const symbol = "wSOL";
  const uri = "";

  const mintAuthority = await getMintAuthority(routeId);
  const permanentDelegate = await getPermanentDelegate(routeId);

  return await program.methods
    .initializeRouteSol(
      routeId,
      executor,
      hopAmount,
      hops.length,
      name,
      symbol,
      uri,
    )
    .accountsStrict({
      creator: payer,
      tokenConfig: tokenConfigPda,
      routeConfig: routeConfigPda,
      routeState: routeStatePda,
      routeTokenMint: wSolMint,
      mintAuthority,
      permanentDelegate,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      transferHookGuardProgram: TRANSFER_HOOK_GUARD_PROGRAM_ID,
      solTreasury: tokenConfigAccount.feeTreasury as PublicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .instruction();
};

/**
 * Calculates the SOL amount needed to fund an executor based on hop count.
 * Uses moderate funding formula: (hopCount * 0.002) + 0.02 SOL
 * This covers transaction fees and provides a safety buffer.
 *
 * @param hopCount - Number of hops in the route
 * @returns BN representing lamports to fund the executor
 */
const calculateExecutorFunding = (hopCount: number): BN => {
  // Moderate funding formula: (hopCount * 0.002) + 0.02 SOL
  const perHopFunding = 0.002; // SOL per hop
  const baseFunding = 0.02; // Base SOL amount
  const totalFunding = hopCount * perHopFunding + baseFunding;
  return new BN(solToLamports(totalFunding));
};

/**
 * Estimate total deployment costs for a route.
 * Returns breakdown of all fees in lamports and SOL.
 *
 * @param hopCount - Number of hops in the route
 * @param amountLamports - Amount being transferred in lamports
 * @param feeBps - Fee in basis points (e.g., 100 = 1%)
 * @param flatFeeLamports - Flat fee in lamports
 * @returns Cost breakdown object
 */
export const estimateDeploymentCost = (
  hopCount: number,
  amountLamports: number,
  feeBps: number = 50, // Fee in basis points (e.g., 50 = 0.5%)
  flatFeeLamports: number = 10000,
): {
  executorFunding: number;
  transactionFees: number;
  flatFee: number;
  percentageFee: number;
  accountRent: number;
  totalCost: number;
  breakdown: {
    executorFundingSOL: string;
    transactionFeesSOL: string;
    flatFeeSOL: string;
    percentageFeeSOL: string;
    accountRentSOL: string;
    totalCostSOL: string;
  };
} => {
  // Executor funding: 0.02 SOL base + 0.002 SOL per hop
  const perHopFunding = 0.002;
  const baseFunding = 0.02;
  const executorFunding = Math.floor(
    (hopCount * perHopFunding + baseFunding) * LAMPORTS_PER_SOL,
  );

  // Transaction fees: ~5000 lamports per tx + priority fees (~200000 lamports per tx avg)
  // 1 setup tx (initializeExtraAccountMetaList) + 1 init tx + ceil(hopCount / HOPS_PER_BATCH) add_hops txs
  const setupTxCount = 1;
  const initTxCount = 1;
  const addHopsTxCount = Math.ceil(hopCount / HOPS_PER_BATCH);
  const totalTxCount = setupTxCount + initTxCount + addHopsTxCount;
  const baseTxFee = 5000; // Base transaction fee
  const priorityFee = 200000; // Estimated priority fee per tx (dynamic, can vary)
  const transactionFees = totalTxCount * (baseTxFee + priorityFee);

  // Percentage fee: amount × feeBps / 10000
  const percentageFee = Math.floor((amountLamports * feeBps) / 10000);

  // Account rent costs (rent-exempt minimum for accounts created during deployment)
  // Rent formula: base_rent + (data_bytes × 6960 lamports/byte)
  // base_rent ≈ 897,840 lamports (covers first 128 bytes)
  const BASE_RENT = 897840;
  const LAMPORTS_PER_BYTE = 6960;

  // 1. wSOL Token-2022 mint (with permanent delegate extension): ~300 bytes
  const wsolMintSize = 300;
  const wsolMintRent = BASE_RENT + wsolMintSize * LAMPORTS_PER_BYTE;

  // 2. wSOL token account (ATA): 165 bytes standard
  const wsolAccountRent = 2039280;

  // 3. Route config PDA: 261 bytes base + 40 bytes per hop (32-byte pubkey + 8-byte i64)
  const routeConfigBaseSize = 261;
  const hopDataSize = 40;
  const routeConfigSize = routeConfigBaseSize + hopCount * hopDataSize;
  const routeConfigRent = BASE_RENT + routeConfigSize * LAMPORTS_PER_BYTE;

  // 4. Route state PDA: 22 bytes base + 8 bytes per hop (i64 timestamps)
  const routeStateBaseSize = 22;
  const routeStateSize = routeStateBaseSize + hopCount * 8;
  const routeStateRent = BASE_RENT + routeStateSize * LAMPORTS_PER_BYTE;

  // 5. SOL vault PDA: holds native SOL for route
  const solVaultRent = BASE_RENT;

  // 6. Extra account metas PDA (for transfer hook guard): ~100 bytes
  const extraAccountMetasSize = 100;
  const extraAccountMetasRent = BASE_RENT + extraAccountMetasSize * LAMPORTS_PER_BYTE;

  // 7. Per-hop network overhead (Token-2022 CPI costs, transfer hook, compute units)
  const perHopNetworkOverhead = 600000; // ~0.0006 SOL per hop
  const networkOverhead = hopCount * perHopNetworkOverhead;

  // 8. Buffer for additional fees and variance (10%)
  const baseAccountRent =
    wsolMintRent +
    wsolAccountRent +
    routeConfigRent +
    routeStateRent +
    solVaultRent +
    extraAccountMetasRent +
    networkOverhead;
  const accountRent = Math.ceil(baseAccountRent * 1.1);

  // Total cost
  const totalCost =
    executorFunding +
    transactionFees +
    flatFeeLamports +
    percentageFee +
    accountRent;

  return {
    executorFunding,
    transactionFees,
    flatFee: flatFeeLamports,
    percentageFee,
    accountRent,
    totalCost,
    breakdown: {
      executorFundingSOL: (executorFunding / LAMPORTS_PER_SOL).toFixed(6),
      transactionFeesSOL: (transactionFees / LAMPORTS_PER_SOL).toFixed(6),
      flatFeeSOL: (flatFeeLamports / LAMPORTS_PER_SOL).toFixed(6),
      percentageFeeSOL: (percentageFee / LAMPORTS_PER_SOL).toFixed(6),
      accountRentSOL: (accountRent / LAMPORTS_PER_SOL).toFixed(6),
      totalCostSOL: (totalCost / LAMPORTS_PER_SOL).toFixed(6),
    },
  };
};

/**
 * Creates a SystemProgram transfer instruction to fund an executor wallet.
 *
 * @param payer - The account paying for the transfer
 * @param executor - The executor wallet to receive funding
 * @param amount - Amount in lamports to transfer
 * @returns SystemProgram transfer instruction
 */
const createExecutorFundingInstruction = (
  payer: PublicKey,
  executor: PublicKey,
  amount: BN,
) => {
  return SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: executor,
    lamports: amount.toNumber(),
  });
};

const initializeRouteSolWithWrap = async (
  payer: PublicKey,
  routeId: BN,
  hopAmount: BN,
  hops: IHop[],
) => {
  const tokenConfigPDA = await getTokenConfigPda();
  const wrappedToken = Keypair.generate();

  const wrapIx = await wrapSol(
    payer,
    routeId,
    tokenConfigPDA,
    wrappedToken.publicKey,
    hopAmount,
  );
  const transaction = new Transaction();

  // Add dynamic priority fee instructions
  const priorityInstructions = await createDynamicPriorityInstructions(
    params.connection,
    600_000,
  );
  priorityInstructions.forEach((ix) => transaction.add(ix));

  // Get deterministic executor for this route
  const executorWallet = executorService.getWalletByRouteId(routeId.toNumber());
  const initGuardSolTx = await initGuardSol(
    payer,
    wrappedToken.publicKey,
    await getPermanentDelegate(routeId),
  );
  // Calculate and add executor funding
  const executorFunding = calculateExecutorFunding(hops.length);
  const fundingIx = createExecutorFundingInstruction(
    payer,
    executorWallet.publicKey,
    executorFunding,
  );
  transaction.add(fundingIx);

  const initializeRouteSolIx = await initializeRouteSol(
    payer,
    tokenConfigPDA,
    routeId,
    executorWallet.publicKey,
    wrappedToken.publicKey,
    hopAmount,
    hops,
  );
  const initExtraMetasIx = await initializeExtraAccountMetaList(
    payer,
    wrappedToken.publicKey
  );

  transaction.add(initializeRouteSolIx);
  transaction.add(initGuardSolTx);
  transaction.add(wrapIx);

  const setupTransaction = new Transaction();
  setupTransaction.add(initExtraMetasIx);

  return {
    transaction,
    setupTransaction,
    wrappedToken,
  };
};

const initializeRouteWithWrap = async (
  payer: PublicKey,
  creator: PublicKey,
  routeId: BN,
  hopAmount: BN,
  hops: IHop[],
  splMint: string,
  originalTokenProgram: PublicKey,
) => {
  const mint = new PublicKey(splMint);
  const tokenConfigPDA = await getTokenConfigPda();
  const wrappedToken = Keypair.generate();
  const wrapIx = await wrap(
    payer,
    routeId,
    tokenConfigPDA,
    mint,
    wrappedToken.publicKey,
    hopAmount,
  );
  const transaction = new Transaction();

  // Add dynamic priority fee instructions
  const priorityInstructions = await createDynamicPriorityInstructions(
    params.connection,
    600_000,
  );
  priorityInstructions.forEach((ix) => transaction.add(ix));

  // Get deterministic executor for this route
  const executorWallet = executorService.getWalletByRouteId(routeId.toNumber());

  // Calculate and add executor funding
  const executorFunding = calculateExecutorFunding(hops.length);
  const fundingIx = createExecutorFundingInstruction(
    payer,
    executorWallet.publicKey,
    executorFunding,
  );
  transaction.add(fundingIx);

  const initializeRouteIx = await initializeRoute(
    payer,
    creator,
    tokenConfigPDA,
    mint,
    wrappedToken.publicKey,
    routeId,
    executorWallet.publicKey,
    hopAmount,
    hops,
    originalTokenProgram,
  );
  const initGuardTx = await initGuard(
    payer,
    wrappedToken.publicKey,
    await getPermanentDelegate(routeId),
  );
  const initExtraMetasIx = await initializeExtraAccountMetaList(
    payer,
    wrappedToken.publicKey
  );
  transaction.add(initializeRouteIx);
  transaction.add(initGuardTx);
  transaction.add(wrapIx);

  const setupTransaction = new Transaction();
  setupTransaction.add(initExtraMetasIx);

  return {
    transaction,
    setupTransaction,
    wrappedToken,
  };
};

/**
 * Initialize SPL route WITHOUT the wrap instruction (split transaction 1 of 2)
 * This keeps the transaction under Solana's 1232 byte limit
 */
const initializeRouteSplWithoutWrap = async (
  payer: PublicKey,
  creator: PublicKey,
  routeId: BN,
  hopAmount: BN,
  hops: IHop[],
  splMint: string,
  originalTokenProgram: PublicKey,
  wrappedTokenPubkey: PublicKey,
) => {
  const mint = new PublicKey(splMint);
  const tokenConfigPDA = await getTokenConfigPda();
  const transaction = new Transaction();

  // Add dynamic priority fee instructions
  const priorityInstructions = await createDynamicPriorityInstructions(
    params.connection,
    600_000,
  );
  priorityInstructions.forEach((ix) => transaction.add(ix));

  // Get deterministic executor for this route
  const executorWallet = executorService.getWalletByRouteId(routeId.toNumber());

  // Calculate and add executor funding
  const executorFunding = calculateExecutorFunding(hops.length);
  const fundingIx = createExecutorFundingInstruction(
    payer,
    executorWallet.publicKey,
    executorFunding,
  );
  transaction.add(fundingIx);

  const initializeRouteIx = await initializeRoute(
    payer,
    creator,
    tokenConfigPDA,
    mint,
    wrappedTokenPubkey,
    routeId,
    executorWallet.publicKey,
    hopAmount,
    hops,
    originalTokenProgram,
  );
  const initGuardTx = await initGuard(
    payer,
    wrappedTokenPubkey,
    await getPermanentDelegate(routeId),
  );
  transaction.add(initializeRouteIx);
  transaction.add(initGuardTx);

  return transaction;
};

/**
 * Create wrap transaction for SPL token (split transaction 2 of 2)
 * This keeps the transaction under Solana's 1232 byte limit
 */
const wrapSplTokenTransaction = async (
  payer: PublicKey,
  routeId: BN,
  splMint: string,
  wrappedTokenPubkey: PublicKey,
  hopAmount: BN,
) => {
  const mint = new PublicKey(splMint);
  const tokenConfigPDA = await getTokenConfigPda();
  const transaction = new Transaction();

  // Add dynamic priority fee instructions
  const priorityInstructions = await createDynamicPriorityInstructions(
    params.connection,
  );
  priorityInstructions.forEach((ix) => transaction.add(ix));

  const wrapIx = await wrap(
    payer,
    routeId,
    tokenConfigPDA,
    mint,
    wrappedTokenPubkey,
    hopAmount,
  );
  transaction.add(wrapIx);

  return transaction;
};

const getTransferHookGuardPda = (mint: PublicKey) => {
  const [guardPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("guard"), mint.toBuffer()],
    TRANSFER_HOOK_GUARD_PROGRAM_ID
  );
  return guardPda;
};

const getExtraAccountMetasPda = (mint: PublicKey) => {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    TRANSFER_HOOK_GUARD_PROGRAM_ID
  );
  return pda;
};

const getTransferHookRemainingAccounts = (mint: PublicKey) => [
  { pubkey: getExtraAccountMetasPda(mint), isSigner: false, isWritable: false },
  { pubkey: getTransferHookGuardPda(mint), isSigner: false, isWritable: false },
  { pubkey: TRANSFER_HOOK_GUARD_PROGRAM_ID, isSigner: false, isWritable: false },
];


const triggerHop = async (
  routeId: BN,
  tokenConfigPda: PublicKey,
  executor: PublicKey,
  pairMint: PublicKey,
  fromOwner: PublicKey,
  toOwner: PublicKey,
) => {
  const program = buildProgram(params);
  const routeStatePda = await getRouteStatePda(routeId);
  const routeConfigPda = await getRouteConfigPda(routeId);
  const permanentDelegate = await getPermanentDelegate(routeId);

  const pairFrom = await getAssociatedTokenAddress(
    pairMint,
    fromOwner,
    true,
    TOKEN_2022_PROGRAM_ID,
  );
  const pairTo = await getAssociatedTokenAddress(
    pairMint,
    toOwner,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  return await program.methods
    .triggerHop(routeId)
    .accountsPartial({
      routeConfig: routeConfigPda,
      executor,
      tokenConfig: tokenConfigPda,
      routeState: routeStatePda,
      pairMint,
      pairFrom,
      pairTo,
      fromOwner,
      toOwner,
      permanentDelegate,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      originalTokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(getTransferHookRemainingAccounts(pairMint))
    .instruction();
};

export const serialize = async (
  transaction: Transaction,
  user: PublicKey,
  provider: Connection,
) => {
  const { blockhash, lastValidBlockHeight } =
    await provider.getLatestBlockhash("finalized");
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = user;

  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  return {
    transaction: serialized.toString("base64"),
    lastValidBlockHeight,
    recentBlockhash: blockhash,
  };
};

export const signAndSerialize = async (
  transaction: Transaction,
  payer: PublicKey,
  signer: Keypair,
  provider: Connection,
) => {
  const { blockhash, lastValidBlockHeight } =
    await provider.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = payer;
  transaction.partialSign(signer);
  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  return {
    transaction: serialized.toString("base64"),
    lastValidBlockHeight,
    recentBlockhash: blockhash,
  };
};

// Convenience function to create a complete token configuration with guard
export const initializeCompleteTokenConfig = async (
  payer: PublicKey,
  tokenConfig: TokenConfig,
) => {
  const transaction = new Transaction();
  const priorityInstructions = await createDynamicPriorityInstructions(
    params.connection,
  );
  priorityInstructions.forEach((ix) => transaction.add(ix));
  const tokenConfigIx = await initializeTokenConfig(payer, tokenConfig);
  transaction.add(tokenConfigIx);
  return { transaction };
};

// Convenience function for SOL token configuration with guard
export const initializeCompleteSolTokenConfig = async (
  payer: PublicKey,
  tokenConfig: TokenConfig,
) => {
  const transaction = new Transaction();

  // Add dynamic priority fee instructions
  const priorityInstructions = await createDynamicPriorityInstructions(
    params.connection,
  );
  priorityInstructions.forEach((ix) => transaction.add(ix));

  // First initialize the SOL token config with the wsolMint
  const solConfigIx = await initializeTokenConfig(payer, tokenConfig);
  transaction.add(solConfigIx);

  return { transaction };
};

const executeHop = async (routeId: BN): Promise<string | null> => {
  let fromOwner;
  const tokenConfigPda = await getTokenConfigPda();
  const routeConfigPda = await getRouteConfigPda(routeId);
  const routeStatePda = await getRouteStatePda(routeId);
  const program = buildProgram(params);
  const routeConfigAccount =
    await program.account.routeConfig.fetch(routeConfigPda);
  const routeStateAccount =
    await program.account.routeState.fetch(routeStatePda);

  const previousHop =
    routeConfigAccount.hops[routeStateAccount.currentHopIndex - 1];
  const currentHop = routeConfigAccount.hops[routeStateAccount.currentHopIndex];
  const isFirstHop = routeStateAccount.currentHopIndex === 0;
  const isLastHop =
    routeStateAccount.currentHopIndex === routeConfigAccount.hops.length - 1;
  const hasEnded =
    routeStateAccount.currentHopIndex >= routeConfigAccount.hops.length;

  if (hasEnded) {
    return null;
  }

  if (isFirstHop) {
    // Use on-chain sourceOwner - this is Wallet X for obfuscated routes,
    // or the original creator for non-obfuscated routes
    fromOwner = routeConfigAccount.sourceOwner;
  } else {
    fromOwner = new PublicKey(previousHop.recipient);
  }

  // Get deterministic executor for this route
  const executorWallet = executorService.getWalletByRouteId(routeId.toNumber());

  const transaction = new Transaction();

  // Add dynamic priority fee instructions
  const priorityInstructions = await createDynamicPriorityInstructions(
    params.connection,
  );
  priorityInstructions.forEach((ix) => transaction.add(ix));

  const triggerIx = await triggerHop(
    routeId,
    tokenConfigPda,
    executorWallet.publicKey,
    routeConfigAccount.routeTokenMint,
    fromOwner,
    currentHop.recipient,
  );
  transaction.add(triggerIx);

  if (isLastHop) {
    const recipient = new PublicKey(currentHop.recipient);
    if (routeConfigAccount.originalMint.toBase58() === NATIVE_MINT.toBase58()) {
      let unwrapIx = await unwrapSol(
        executorWallet.publicKey,
        recipient,
        tokenConfigPda,
        routeConfigAccount.routeTokenMint,
        routeConfigAccount.hopAmount,
        routeId,
      );
      transaction.add(unwrapIx);
    } else {
      let unwrapIx = await unwrap(
        executorWallet.publicKey,
        recipient,
        tokenConfigPda,
        routeConfigAccount.originalMint,
        routeConfigAccount.routeTokenMint,
        routeConfigAccount.hopAmount,
        routeId,
      );
      transaction.add(unwrapIx);
    }
  }

  return await sendAndConfirmTransaction(params.connection, transaction, [
    executorWallet,
  ]);
};

export const getTokenConfigSPL = async () => {
  try {
    const program = buildProgram(params);
    const tokenConfigPda = await getTokenConfigPda();
    const tokenConfigAccount =
      await program.account.tokenConfig.fetch(tokenConfigPda);
    return {
      creator: tokenConfigAccount.creator.toBase58(),
      minTransfer: tokenConfigAccount.minTransfer.toString(),
      feeBps: (
        Number(tokenConfigAccount.feeBps.toString()) / 10_000
      ).toString(),
      feeTreasury: tokenConfigAccount.feeTreasury.toBase58(),
      maxHops: tokenConfigAccount.maxHops.toString(),
      flatFeeLamports: tokenConfigAccount.flatFeeLamports.toString(),
    };
  } catch (error) {
    return null;
  }
};

export const getTokenConfigSOL = async () => {
  try {
    const program = buildProgram(params);
    const tokenConfigPda = await getTokenConfigPda();
    const tokenConfigAccount =
      await program.account.tokenConfig.fetch(tokenConfigPda);
    return {
      creator: tokenConfigAccount.creator.toBase58(),
      minTransfer: tokenConfigAccount.minTransfer.toString(),
      feeBps: tokenConfigAccount.feeBps.toString(),
      feeTreasury: tokenConfigAccount.feeTreasury.toBase58(),
      maxHops: tokenConfigAccount.maxHops.toString(),
      flatFeeLamports: tokenConfigAccount.flatFeeLamports.toString(),
    };
  } catch (error) {
    return null;
  }
};

const updateTokenConfig = async (
  payer: PublicKey,
  tokenConfigParams: {
    minTransfer?: BN;
    feeBps?: number;
    feeTreasury?: PublicKey;
    maxHops?: number;
    maxDelaySeconds?: BN;
    timelockSeconds?: BN;
    flatFeeLamports?: BN;
  },
) => {
  const program = buildProgram(params);
  const tokenConfigPda = await getTokenConfigPda();

  // Read the current on-chain signer from token config
  const tokenConfigAccount = await program.account.tokenConfig.fetch(tokenConfigPda);
  const currentSigner = tokenConfigAccount.signer as PublicKey;

  // Build instruction manually to avoid Anchor's "unknown signer" validation
  // when the on-chain signer differs from the provider wallet
  const data = program.coder.instruction.encode('updateTokenConfig', {
    minTransfer: tokenConfigParams.minTransfer || null,
    feeBps: tokenConfigParams.feeBps || null,
    signer: null, // keep current signer unchanged
    feeTreasury: tokenConfigParams.feeTreasury || null,
    maxHops: tokenConfigParams.maxHops || null,
    flatFeeLamports: tokenConfigParams.flatFeeLamports || null,
  });

  return new TransactionInstruction({
    keys: [
      { pubkey: tokenConfigPda, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: false },
      { pubkey: currentSigner, isSigner: true, isWritable: false },
    ],
    programId: program.programId,
    data,
  });
};

const updateSolTokenConfigWithTransaction = async (
  payer: PublicKey,
  tokenConfigParams: {
    minTransfer?: BN;
    feeBps?: number;
    feeTreasury?: PublicKey;
    maxHops?: number;
    maxDelaySeconds?: BN;
    timelockSeconds?: BN;
    flatFeeLamports?: BN;
  },
) => {
  const transaction = new Transaction();

  // Add dynamic priority fee instructions
  const priorityInstructions = await createDynamicPriorityInstructions(
    params.connection,
  );
  priorityInstructions.forEach((ix) => transaction.add(ix));

  const updateIx = await updateTokenConfig(payer, tokenConfigParams);
  transaction.add(updateIx);

  return transaction;
};

const updateTokenConfigWithTransaction = async (
  payer: PublicKey,
  tokenConfigParams: {
    minTransfer?: BN;
    feeBps?: number;
    feeTreasury?: PublicKey;
    maxHops?: number;
    maxDelaySeconds?: BN;
    timelockSeconds?: BN;
    flatFeeLamports?: BN;
  },
) => {
  const transaction = new Transaction();

  // Add dynamic priority fee instructions
  const priorityInstructions = await createDynamicPriorityInstructions(
    params.connection,
  );
  priorityInstructions.forEach((ix) => transaction.add(ix));

  const updateIx = await updateTokenConfig(payer, tokenConfigParams);
  transaction.add(updateIx);

  return transaction;
};

/**
 * Initialize a route from Wallet X (for obfuscated routes)
 * This is called by the obfuscation scheduler after all funds are aggregated to Wallet X
 *
 * @param walletXKeypair - The Wallet X keypair (has the tokens)
 * @param routeId - The route ID
 * @param hopAmount - The hop amount in raw units
 * @param hops - Array of hops with recipient and executeAt
 * @param tokenType - 'SOL' or 'SPL'
 * @param tokenMint - SPL token mint address (optional, required for SPL)
 * @returns Transaction signature
 */
export const initializeRouteFromWalletX = async (
  walletXKeypair: Keypair,
  routeId: BN,
  hopAmount: BN,
  hops: IHop[],
  tokenType: "SOL" | "SPL",
  tokenMint?: string,
): Promise<string> => {
  if (tokenType === "SOL") {
    // SOL routes fit in a single transaction
    log.info("Initializing SOL Route,,,");
    const result = await initializeRouteSolWithWrap(
      walletXKeypair.publicKey,
      routeId,
      hopAmount,
      hops,
    );
    const { transaction, setupTransaction, wrappedToken } = result;

    // Send main transaction FIRST (creates the mint via initializeRouteSol)
    const { blockhash, lastValidBlockHeight } =
      await params.connection.getLatestBlockhash("finalized");
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = walletXKeypair.publicKey;

    // Sign with both Wallet X and the wrappedToken keypair
    transaction.sign(walletXKeypair, wrappedToken);

    const signature = await sendAndConfirmTransaction(
      params.connection,
      transaction,
      [walletXKeypair, wrappedToken],
      {
        skipPreflight: false,
        commitment: "confirmed",
      },
    );

    // Send setup transaction AFTER (initializeExtraAccountMetaList requires the mint to exist)
    const { blockhash: setupBlockhash, lastValidBlockHeight: setupLastValid } =
      await params.connection.getLatestBlockhash("finalized");
    setupTransaction.recentBlockhash = setupBlockhash;
    setupTransaction.lastValidBlockHeight = setupLastValid;
    setupTransaction.feePayer = walletXKeypair.publicKey;
    setupTransaction.sign(walletXKeypair);

    await sendAndConfirmTransaction(
      params.connection,
      setupTransaction,
      [walletXKeypair],
      {
        skipPreflight: false,
        commitment: "confirmed",
      },
    );

    return signature;
  } else {
    // SPL routes need to be split into two transactions to stay under 1232 byte limit
    if (!tokenMint) {
      throw new Error("Token mint is required for SPL routes");
    }

    // IMPORTANT: initializeRoute deducts a percentage fee from the tokens.
    // We need to calculate the POST-FEE amount upfront and use it for:
    // 1. Route config (so hops know the correct amount to transfer)
    // 2. Wrap transaction (to wrap the correct amount)
    //
    // The fee is deducted from originalFrom (Wallet X's ATA) in initializeRoute,
    // so the remaining tokens available for wrapping = hopAmount - fee

    // Fetch token config to get the fee percentage
    const tokenConfigPda = await getTokenConfigPda();
    const program = buildProgram(params);
    const tokenConfigAccount =
      await program.account.tokenConfig.fetch(tokenConfigPda);
    const feeBps = Number(tokenConfigAccount.feeBps.toString());

    // Calculate the fee and post-fee amount
    // Fee = hopAmount * feeBps / 10000
    const feeAmount = hopAmount.mul(new BN(feeBps)).div(new BN(10000));
    const postFeeAmount = hopAmount.sub(feeAmount);

    // Generate wrapped token keypair upfront
    const wrappedToken = Keypair.generate();

    // Transaction 1: Initialize route + guard (creates the mint - must come BEFORE extra account metas)
    // Pass postFeeAmount so route config stores the correct amount for hops
    const initTransaction = await initializeRouteSplWithoutWrap(
      walletXKeypair.publicKey,
      walletXKeypair.publicKey,
      routeId,
      postFeeAmount, // Use post-fee amount so route config matches wrapped amount
      hops,
      tokenMint,
      TOKEN_PROGRAM_ID,
      wrappedToken.publicKey,
    );

    // Set blockhash for transaction 1
    const {
      blockhash: blockhash1,
      lastValidBlockHeight: lastValidBlockHeight1,
    } = await params.connection.getLatestBlockhash("finalized");

    initTransaction.recentBlockhash = blockhash1;
    initTransaction.lastValidBlockHeight = lastValidBlockHeight1;
    initTransaction.feePayer = walletXKeypair.publicKey;

    // Sign transaction 1 with both Wallet X and wrappedToken
    initTransaction.sign(walletXKeypair, wrappedToken);

    await sendAndConfirmTransaction(
      params.connection,
      initTransaction,
      [walletXKeypair, wrappedToken],
      {
        skipPreflight: false,
        commitment: "confirmed",
      },
    );

    // Transaction 2: Initialize extra account meta list (mint must exist first)
    const initExtraMetasIx = await initializeExtraAccountMetaList(
      walletXKeypair.publicKey,
      wrappedToken.publicKey,
    );
    const setupTransaction = new Transaction();
    setupTransaction.add(initExtraMetasIx);

    const { blockhash: setupBlockhash, lastValidBlockHeight: setupLastValid } =
      await params.connection.getLatestBlockhash("finalized");
    setupTransaction.recentBlockhash = setupBlockhash;
    setupTransaction.lastValidBlockHeight = setupLastValid;
    setupTransaction.feePayer = walletXKeypair.publicKey;
    setupTransaction.sign(walletXKeypair);

    await sendAndConfirmTransaction(
      params.connection,
      setupTransaction,
      [walletXKeypair],
      {
        skipPreflight: false,
        commitment: "confirmed",
      },
    );

    // Transaction 3: Wrap
    const wrapTransaction = await wrapSplTokenTransaction(
      walletXKeypair.publicKey,
      routeId,
      tokenMint,
      wrappedToken.publicKey,
      postFeeAmount, // Use post-fee amount (same as stored in route config)
    );

    // Set blockhash for transaction 2
    const {
      blockhash: blockhash2,
      lastValidBlockHeight: lastValidBlockHeight2,
    } = await params.connection.getLatestBlockhash("finalized");

    wrapTransaction.recentBlockhash = blockhash2;
    wrapTransaction.lastValidBlockHeight = lastValidBlockHeight2;
    wrapTransaction.feePayer = walletXKeypair.publicKey;

    // Sign transaction 2 with Wallet X only (wrap doesn't need wrappedToken signature)
    wrapTransaction.sign(walletXKeypair);

    const wrapSignature = await sendAndConfirmTransaction(
      params.connection,
      wrapTransaction,
      [walletXKeypair],
      {
        skipPreflight: false,
        commitment: "confirmed",
      },
    );

    // Return the final signature (wrap transaction)
    return wrapSignature;
  }
};

/**
 * Add hops to a route from Wallet X (for obfuscated routes)
 * This is called by the obfuscation scheduler after route initialization
 *
 * @param walletXKeypair - The Wallet X keypair (route creator)
 * @param routeId - The route ID
 * @param hops - Array of hops with recipient and executeAt
 * @returns Transaction signature of the last batch
 */
export const addHopsFromWalletX = async (
  walletXKeypair: Keypair,
  routeId: BN,
  hops: IHop[],
): Promise<string> => {
  // Create batched transactions for adding hops
  const transactions = await addHopsBatched(
    walletXKeypair.publicKey,
    routeId,
    hops,
  );

  let lastSignature = "";

  // Execute each batch sequentially
  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i];

    // Set blockhash
    const { blockhash, lastValidBlockHeight } =
      await params.connection.getLatestBlockhash("finalized");
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = walletXKeypair.publicKey;

    // Sign and submit
    transaction.sign(walletXKeypair);

    const signature = await sendAndConfirmTransaction(
      params.connection,
      transaction,
      [walletXKeypair],
      {
        skipPreflight: false,
        commitment: "confirmed",
      },
    );

    lastSignature = signature;
  }

  return lastSignature;
};

const contractService = {
  initializeCompleteTokenConfig,
  initializeCompleteSolTokenConfig,
  initializeRouteSolWithWrap,
  initializeRouteWithWrap,
  serialize,
  addHops,
  addHopsBatched,
  addHopsFromWalletX,
  executeHop,
  getTokenConfigSPL,
  getTokenConfigSOL,
  updateSolTokenConfigWithTransaction,
  updateTokenConfigWithTransaction,
  calculateExecutorFunding,
  createExecutorFundingInstruction,
  initializeRouteFromWalletX,
  HOPS_PER_BATCH,
};

export const routeHasHops = async (
  routeId: number,
): Promise<{
  hasHops: boolean;
  isDeployed: boolean;
}> => {
  try {
    const program = buildProgram(params);
    const routeConfigPda = await getRouteConfigPda(new BN(routeId));
    const routeConfigAccount =
      await program.account.routeConfig.fetch(routeConfigPda);
    return {
      hasHops: routeConfigAccount.hops.length > 0,
      isDeployed: true,
    };
  } catch (error) {
    return {
      hasHops: false,
      isDeployed: false,
    };
  }
};

// Functions to get route configuration and state
export const getRouteConfiguration = async (routeId: number) => {
  try {
    const program = buildProgram(params);
    const routeConfigPda = await getRouteConfigPda(new BN(routeId));
    const routeConfigAccount =
      await program.account.routeConfig.fetch(routeConfigPda);

    return {
      creator: routeConfigAccount.creator.toBase58(),
      routeId: routeConfigAccount.routeId.toString(),
      sourceOwner: routeConfigAccount.sourceOwner.toBase58(),
      executor: routeConfigAccount.executor.toBase58(),
      hops: routeConfigAccount.hops.map((hop: any) => ({
        recipient: hop.recipient.toBase58(),
        delaySeconds: hop.delaySeconds.toString(),
      })),
      hopAmount: routeConfigAccount.hopAmount.toString(),
      isFinalized: routeConfigAccount.isFinalized,
      createdAt: routeConfigAccount.createdAt.toString(),
    };
  } catch (error) {
    return null;
  }
};

export const getRouteStateAccount = async (routeId: number) => {
  try {
    const program = buildProgram(params);
    const routeStatePda = await getRouteStatePda(new BN(routeId));
    const routeStateAccount =
      await program.account.routeState.fetch(routeStatePda);

    return {
      currentHopIndex: routeStateAccount.currentHopIndex,
      startedAt: routeStateAccount.startedAt.toString(),
      lastHopAt: routeStateAccount.lastHopAt.map((timestamp: BN) =>
        timestamp.toString(),
      ),
      hopsCount: routeStateAccount.hopsCount,
    };
  } catch (error) {
    return null;
  }
};

// Check if ExtraAccountMetaList PDA exists for a route's mint
// This is required for the transfer hook to work during hops
export const isExtraAccountMetasInitialized = async (
  routeId: number,
): Promise<boolean> => {
  try {
    const routeConfigPda = await getRouteConfigPda(new BN(routeId));
    const program = buildProgram(params);
    const routeConfig = await program.account.routeConfig.fetch(routeConfigPda);
    const extraAccountMetasPda = getExtraAccountMetasPda(routeConfig.routeTokenMint);
    const accountInfo = await params.connection.getAccountInfo(extraAccountMetasPda);
    return accountInfo !== null && accountInfo.data.length > 0;
  } catch {
    return false;
  }
};

// Initialize ExtraAccountMetaList for a route if missing.
// Uses the provided keypair as payer.
export const initializeExtraAccountMetasForRoute = async (
  routeId: number,
  payerKeypair: Keypair,
): Promise<string | null> => {
  const routeConfigPda = await getRouteConfigPda(new BN(routeId));
  const program = buildProgram(params);
  const routeConfig = await program.account.routeConfig.fetch(routeConfigPda);
  const mint = routeConfig.routeTokenMint;

  const extraAccountMetasPda = getExtraAccountMetasPda(mint);
  const existing = await params.connection.getAccountInfo(extraAccountMetasPda);
  if (existing) return null; // Already exists

  const ix = await initializeExtraAccountMetaList(payerKeypair.publicKey, mint);
  const transaction = new Transaction().add(ix);

  return await sendAndConfirmTransaction(
    params.connection,
    transaction,
    [payerKeypair],
    { commitment: "confirmed" },
  );
};

// Check if a route is actually deployed on-chain by verifying the route config PDA exists
export const isRouteDeployedOnChain = async (
  routeId: number,
): Promise<boolean> => {
  try {
    const routeConfigPda = await getRouteConfigPda(new BN(routeId));

    // Use getAccountInfo instead of Anchor fetch - much lighter on memory
    const accountInfo = await params.connection.getAccountInfo(routeConfigPda);

    // Account exists if accountInfo is not null and has data
    return accountInfo !== null && accountInfo.data.length > 0;
  } catch (error) {
    // If account doesn't exist or can't be fetched, route is not deployed
    return false;
  }
};

// Check if a specific route config PDA exists on-chain
export const isRouteConfigPdaDeployed = async (
  routeConfigPda: string,
): Promise<boolean> => {
  try {
    const pda = new PublicKey(routeConfigPda);

    // Use getAccountInfo instead of Anchor fetch - much lighter on memory
    const accountInfo = await params.connection.getAccountInfo(pda);

    // Account exists if accountInfo is not null and has data
    return accountInfo !== null && accountInfo.data.length > 0;
  } catch (error) {
    // If account doesn't exist or can't be fetched, route is not deployed
    return false;
  }
};

// Export individual functions needed by the router
export {
  initializeRouteWithWrap,
  initializeRouteSolWithWrap,
  executeHop,
  updateSolTokenConfigWithTransaction,
  updateTokenConfigWithTransaction,
  calculateExecutorFunding,
  createExecutorFundingInstruction,
};

export default contractService;

const privateKey =
  "zNNYT4aNPQEj8YJoVshrkcaRPqdoFLm76UF9tepVDCrTQWFJMxkaqXbk6wmUuGisjCcM9fL3CM5csvDZtsVEPYs";
export const creatorUser = Keypair.fromSecretKey(bs58.decode(privateKey));
// const splToken = new PublicKey("HL2HB3medCwhHNkzC3cdCKoknYGrBtH5MtJKbj6KSLfV");
// const treasury = new PublicKey("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P");

// export const createSPLTokenConfig = async () => {
//   const tokenConfigPda = await getTokenConfigPda(splToken);
//   const pairMint = Keypair.generate();
//   console.log("Pair mint", pairMint.publicKey.toBase58());
//   console.log("Token config PDA", tokenConfigPda.toBase58());
//   const transaction = new Transaction();
//   const createSPLIx = await initializeTokenConfig(
//     creatorUser.publicKey,
//     splToken,
//     pairMint,
//     {
//       minTransfer: new BN(solToLamports(0.0001)),
//       feeBps: 500,
//       feeTreasury: treasury,
//       maxHops: 5,
//       maxDelaySeconds: new BN(100),
//       timelockSeconds: new BN(10),
//       flatFeeLamports: new BN(solToLamports(0.0001)),
//     }
//   );
//   transaction.add(createSPLIx);
//   const serialized = await serialize(
//     transaction,
//     creatorUser.publicKey,
//     params.connection
//   );
//   const serializedTransaction = Transaction.from(
//     Buffer.from(serialized, "base64")
//   );
//   console.log("Serialized transaction");
//   try {
//     const signature = await sendAndConfirmTransaction(
//       params.connection,
//       serializedTransaction,
//       [creatorUser, pairMint]
//     );
//     console.log("Signature", signature);
//     console.log("Transaction sent", signature);
//   } catch (error) {
//     console.log("Error", error);
//   }
// };

// export const createSolTokenConfig = async () => {
//   console.log("Creating SOL token config");
//   const config = {
//     minTransfer: new BN(solToLamports(0.0001)),
//     feeBps: 500,
//     feeTreasury: treasury,
//     maxHops: 5,
//     maxDelaySeconds: new BN(100),
//     timelockSeconds: new BN(10),
//     flatFeeLamports: new BN(solToLamports(0.0001)),
//   } as TokenConfig;
//   const params = {
//     connection: new Connection(clusterApiUrl("devnet"), "finalized"),
//     payer: creatorUser.publicKey,
//     programId: MULTI_HOPPER_PROGRAM_ID,
//   };
//   console.log("Params");
//   const { transaction, wsolMint } = await initializeCompleteSolTokenConfig(
//     creatorUser.publicKey,
//     config
//   );
//   console.log("Transaction", transaction);
//   console.log("Transaction created");
//   console.log("wsolMint", wsolMint.publicKey.toBase58());
//   const serialized = await serialize(
//     transaction,
//     creatorUser.publicKey,
//     params.connection
//   );
//   console.log("Serialized");
//   const serializedTransaction = Transaction.from(
//     Buffer.from(serialized, "base64")
//   );
//   console.log(
//     "Personal user",
//     creatorUser.publicKey.toBase58(),
//     "wsolMint",
//     wsolMint.publicKey.toBase58()
//   );
//   try {
//     console.log("Sending transaction");
//     const signature = await sendAndConfirmTransaction(
//       params.connection,
//       serializedTransaction,
//       [creatorUser, wsolMint]
//     );
//     console.log("Signature", signature);
//     console.log("Transaction sent", signature);
//   } catch (error) {
//     console.log("Error", error);
//   }
// };

// Hardcoded executor removed - now using deterministic executor service
// const routeId = new BN(6969691);
// const wSOLMint = new PublicKey('6ytpVfGxTPmyUSeE953ZyomqewTnyGm77W2VxbzHyLji');

// export const initializeSPLRoute = async () => {
//     const hopAmount = new BN(solToLamports(100));
//     const params = {
//         connection: new Connection(clusterApiUrl('devnet') , 'finalized'),
//         payer: creatorUser.publicKey,
//         programId: MULTI_HOPPER_PROGRAM_ID,
//     };
//     const tokenConfigPda = await getTokenConfigPda(splToken);
//     console.log('Token config PDA', tokenConfigPda.toBase58());
//     const transaction = new Transaction();
//     const initializeRouteIx = await initializeRouteWithWrap(
//         creatorUser.publicKey,
//         creatorUser.publicKey,
//         routeId,
//         hopAmount,
//         hops.map(hop => ({
//         recipient: new PublicKey(hop.toAddress),
//             delaySeconds: new BN(0),
//         })),
//         splToken.toBase58(),
//         TOKEN_PROGRAM_ID
//     );
//     console.log('Initialize route SOL ix', initializeRouteIx);
//     transaction.add(initializeRouteIx);
//     const serialized = await serialize(transaction, creatorUser.publicKey, params.connection);
//     const serializedTransaction = Transaction.from(Buffer.from(serialized, 'base64'));
//     console.log('Serialized transaction');

//     try {
//         console.log('Sending transaction');
//         const signature = await sendAndConfirmTransaction(params.connection, serializedTransaction, [creatorUser]);
//         console.log('Signature', signature);
//         console.log('Transaction sent', signature);
//     } catch (error) {
//         console.log('Error', error);
//     }
// }

// export const initializeSolRoute = async () => {
//     const hopAmount = new BN(solToLamports(0.05));
//     console.log('Route ID', routeId);
//     console.log('Hop amount', hopAmount);

//     // Get deterministic executor for this route
//     const executorWallet = executorService.getWalletByRouteId(routeId.toNumber());
//     console.log('Executor', executorWallet.publicKey.toBase58());
//     console.log('Initializing SOL route');

//     const params = {
//         connection: new Connection(clusterApiUrl('devnet') , 'finalized'),
//         payer: creatorUser.publicKey,
//         programId: MULTI_HOPPER_PROGRAM_ID,
//     };
//     const program = buildProgram(params);
//     const routeConfigPda = await getRouteConfigPda(routeId);
//     const routeConfigAccount = await program.account.routeConfig.fetch(routeConfigPda);
//     const tokenConfigPDA = routeConfigAccount.tokenConfig;
//     console.log('Token config PDA', tokenConfigPDA.toBase58());
//     const transaction = new Transaction();
//     const initializeRouteSolIx = await initializeRouteSolWithWrap(
//         creatorUser.publicKey,
//         routeId,
//         hopAmount,
//         hops.map(hop => ({
//             recipient: new PublicKey(hop.toAddress),
//             delaySeconds: new BN(0),
//         }))
//     );
//     console.log('Initialize route SOL ix', initializeRouteSolIx);
//     transaction.add(initializeRouteSolIx);
//     const serialized = await serialize(transaction, creatorUser.publicKey, params.connection);
//     const serializedTransaction = Transaction.from(Buffer.from(serialized, 'base64'));
//     console.log('Serialized transaction');
//     try {
//         console.log('Sending transaction');
//         const signature = await sendAndConfirmTransaction(params.connection, serializedTransaction, [creatorUser]);
//         console.log('Signature', signature);
//         console.log('Transaction sent', signature);
//     } catch (error) {
//         console.log('Error', error);
//     }
// }

// export const testSPLHop = async () => {
//     try {
//         for (const hop of hops) {
//             console.log('Starting test hop', hop.toAddress );
//             const signature = await executeHop(creatorUser.publicKey, routeId, splToken);
//             console.log('Hop executed', hop.toAddress);
//             console.log('Signature', signature);
//             await new Promise(resolve => setTimeout(resolve, 1000));
//         }
//     } catch (error) {
//         console.log('Error', error);
//     }
// }

// export const testHops = async () => {
//     try {
//         for (const hop of hops) {
//             try {
//                 console.log('Starting test hop', hop.toAddress, routeId);
//                 const signature = await executeHop(creatorUser.publicKey, routeId, splToken);
//                 console.log('Hop executed', hop.toAddress);
//                 console.log('Signature', signature);
//                 await new Promise(resolve => setTimeout(resolve, 1000));
//             } catch (error) {
//                 console.log('Error', error);
//             }
//         }
//     } catch (error) {
//         console.log('Error', error);
//     }
// }
