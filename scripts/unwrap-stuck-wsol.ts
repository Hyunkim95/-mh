/**
 * Script to unwrap stuck wSOL from route #2015
 *
 * The wSOL was intercepted and sent to WNZhS12V6G2pqsxBGqg4ZJpgBDuMJJxE3kGMZ939QLU
 * by a whitehat. We're unwrapping in-place as a reward.
 *
 * This script uses the signer wallet + permanent delegate to:
 * 1. Burn the wSOL from the whitehat's ATA
 * 2. Send native SOL from the sol_vault to the same whitehat wallet
 *
 * Usage:
 *   EXECUTOR_SEED=<seed> SOLANA_RPC_URL=<rpc> npx tsx scripts/unwrap-stuck-wsol.ts
 *
 * Add --execute flag to actually send the transaction (dry-run by default)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN, utils } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";
import crypto from "crypto";
import * as IDL from "../libs/server/src/solana/idl/multi_hopper_project.json";

const PROGRAM_ID = new PublicKey(
  "3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh",
);

const ROUTE_ID = 2015;

// Whitehat wallet that intercepted the wSOL — unwrap in-place as reward
const WHITEHAT_WALLET = new PublicKey(
  "WNZhS12V6G2pqsxBGqg4ZJpgBDuMJJxE3kGMZ939QLU",
);

function getSigner(): Keypair {
  const executorSeed = process.env.EXECUTOR_SEED;
  if (!executorSeed) {
    throw new Error("EXECUTOR_SEED environment variable is required");
  }
  const seedString = `${executorSeed}_signer`;
  const hash = crypto.createHash("sha256").update(seedString).digest();
  return Keypair.fromSeed(hash.slice(0, 32));
}

function getRouteConfigPda(routeId: BN): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("route"), routeId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );
  return pda;
}

function getRouteStatePda(routeId: BN): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state"), routeId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );
  return pda;
}

function getPermanentDelegate(routeId: BN): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegate"), routeId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );
  return pda;
}

function getTokenConfigPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_config_global")],
    PROGRAM_ID,
  );
  return pda;
}

function getSolVault(creator: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault"), creator.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

async function main() {
  const isDryRun = !process.argv.includes("--execute");

  console.log("=== Unwrap Stuck wSOL - Route #2015 ===\n");
  if (isDryRun) {
    console.log("🔍 DRY RUN MODE - add --execute flag to send transaction\n");
  }

  const rpcUrl =
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  // Load signer
  const signer = getSigner();
  console.log(`Signer wallet: ${signer.publicKey.toBase58()}`);
  console.log(`Whitehat wallet: ${WHITEHAT_WALLET.toBase58()}`);

  // Check signer balance
  const signerBalance = await connection.getBalance(signer.publicKey);
  console.log(`Signer balance: ${signerBalance / 1e9} SOL`);
  if (signerBalance < 10_000_000) {
    console.error(
      "WARNING: Signer balance is low, may not have enough for tx fees",
    );
  }

  // Build program
  const program = new Program(
    IDL as any,
    new AnchorProvider(connection, {} as any, {}),
  );

  const routeId = new BN(ROUTE_ID);

  // Fetch route config
  const routeConfigPda = getRouteConfigPda(routeId);
  const routeStatePda = getRouteStatePda(routeId);
  const tokenConfigPda = getTokenConfigPda();

  console.log(`\nRoute Config PDA: ${routeConfigPda.toBase58()}`);
  console.log(`Route State PDA: ${routeStatePda.toBase58()}`);
  console.log(`Token Config PDA: ${tokenConfigPda.toBase58()}`);

  const routeConfigAccount =
    await program.account.routeConfig.fetch(routeConfigPda);
  const tokenConfigAccount =
    await program.account.tokenConfig.fetch(tokenConfigPda);

  const wsolMint = routeConfigAccount.routeTokenMint as PublicKey;
  const hopAmount = routeConfigAccount.hopAmount as BN;
  const creator = tokenConfigAccount.creator as PublicKey;

  // Route ownership & state info
  console.log(`\n--- Route Info ---`);
  console.log(`Route Creator: ${(routeConfigAccount.creator as PublicKey).toBase58()}`);
  console.log(`Source Owner: ${(routeConfigAccount.sourceOwner as PublicKey).toBase58()}`);
  console.log(`Executor: ${(routeConfigAccount.executor as PublicKey).toBase58()}`);
  console.log(`Hops: ${(routeConfigAccount.hops as any[]).length}`);
  (routeConfigAccount.hops as any[]).forEach((hop: any, i: number) => {
    console.log(`  Hop ${i}: ${hop.recipient.toBase58()}`);
  });

  const routeStateAccount = await program.account.routeState.fetch(routeStatePda);
  console.log(`Current Hop Index: ${routeStateAccount.currentHopIndex}`);
  console.log(`Hops Count: ${routeStateAccount.hopsCount}`);

  console.log(`\nwSOL Mint: ${wsolMint.toBase58()}`);
  console.log(`Hop Amount: ${hopAmount.toString()} lamports (${Number(hopAmount) / 1e9} SOL)`);

  // Derive PDAs
  const permanentDelegate = getPermanentDelegate(routeId);
  const solVault = getSolVault(creator);

  console.log(`Permanent Delegate PDA: ${permanentDelegate.toBase58()}`);
  console.log(`SOL Vault PDA: ${solVault.toBase58()}`);

  // Check sol vault balance
  const vaultBalance = await connection.getBalance(solVault);
  console.log(`SOL Vault balance: ${vaultBalance / 1e9} SOL`);

  // Get the wSOL ATA for the whitehat wallet
  const wsolFrom = await getAssociatedTokenAddress(
    wsolMint,
    WHITEHAT_WALLET,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  console.log(`wSOL ATA (whitehat): ${wsolFrom.toBase58()}`);

  // Check wSOL balance in the whitehat wallet
  try {
    const tokenBalance = await connection.getTokenAccountBalance(wsolFrom);
    console.log(
      `wSOL balance in whitehat wallet: ${tokenBalance.value.uiAmountString} wSOL`,
    );
  } catch (e) {
    console.error("Could not fetch wSOL balance from whitehat wallet:", e);
  }

  // Build the unwrapSol instruction
  const unwrapIx = await program.methods
    .unwrapSol(routeId, hopAmount)
    .accountsPartial({
      payer: signer.publicKey,
      tokenConfig: tokenConfigPda,
      wsolMint,
      wsolFrom,
      from: WHITEHAT_WALLET,
      to: WHITEHAT_WALLET,
      routeConfig: routeConfigPda,
      routeState: routeStatePda,
      permanentDelegate,
      solVault,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  // Build transaction with priority fee
  const transaction = new Transaction();
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
  );
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
  );
  transaction.add(unwrapIx);

  if (isDryRun) {
    console.log("\n--- DRY RUN ---");
    console.log("Transaction built successfully with instructions:");
    console.log(`  - SetComputeUnitLimit: 400,000`);
    console.log(`  - SetComputeUnitPrice: 50,000 micro-lamports`);
    console.log(
      `  - unwrapSol: burn ${Number(hopAmount) / 1e9} wSOL from ${WHITEHAT_WALLET.toBase58()}`,
    );
    console.log(`               send SOL to ${WHITEHAT_WALLET.toBase58()} (whitehat reward)`);
    console.log("\nRe-run with --execute to send the transaction.");
  } else {
    console.log("\nSending transaction...");
    try {
      const txSig = await sendAndConfirmTransaction(connection, transaction, [
        signer,
      ]);
      console.log(`\nTransaction successful!`);
      console.log(`Signature: ${txSig}`);
      console.log(`Explorer: https://solscan.io/tx/${txSig}`);
    } catch (e) {
      console.error("\nTransaction failed:", e);
      process.exit(1);
    }
  }
}

main().catch(console.error);
