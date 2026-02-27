/**
 * Backfill script: Initialize ExtraAccountMetaList PDAs for existing routes.
 *
 * Routes created before the initializeExtraAccountMetaList call was added to
 * the initialization flow are missing this PDA, which causes transfer_checked
 * to fail with "An account required by the instruction is missing".
 *
 * Usage:
 *   npx tsx libs/server/src/solana/services/backfill-extra-account-metas.ts
 *
 * Set env vars:
 *   SOLANA_RPC_URL    - RPC endpoint
 *   EXECUTOR_SEED     - Seed for deterministic executor keypairs
 *   ROUTE_IDS         - (optional) Comma-separated route IDs to backfill, e.g. "2048,2049"
 *                       If omitted, you must pass them as CLI args: npx tsx ... 2048 2049
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { MultiHopperProject } from "../idl/multi_hopper_project";
import { TransferHookGuard } from "../idl/transfer_hook_guard";
import * as IDLJson from "../idl/multi_hopper_project.json";
import * as GuardIDLJson from "../idl/transfer_hook_guard.json";
import executorService from "../../executors/executor.service";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../../../.env") });

const TRANSFER_HOOK_GUARD_PROGRAM_ID = new PublicKey(GuardIDLJson.address);
const MULTI_HOPPER_PROGRAM_ID = new PublicKey(IDLJson.address);

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "",
  { commitment: "confirmed" }
);

const buildProgram = () =>
  new Program<MultiHopperProject>(
    IDLJson as any,
    new AnchorProvider(connection, {} as any, {})
  );

const buildGuardProgram = () =>
  new Program<TransferHookGuard>(
    GuardIDLJson as any,
    new AnchorProvider(connection, {} as any, {})
  );

const getRouteConfigPda = (routeId: BN) => {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("route"), routeId.toArrayLike(Buffer, "le", 8)],
    MULTI_HOPPER_PROGRAM_ID
  );
  return pda;
};

const getExtraAccountMetasPda = (mint: PublicKey) => {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    TRANSFER_HOOK_GUARD_PROGRAM_ID
  );
  return pda;
};

async function backfillRoute(routeId: number): Promise<string | null> {
  const program = buildProgram();
  const guardProgram = buildGuardProgram();

  // Fetch route config to get the route token mint
  const routeConfigPda = getRouteConfigPda(new BN(routeId));
  const routeConfig = await program.account.routeConfig.fetch(routeConfigPda);
  const mint = routeConfig.routeTokenMint;

  // Check if ExtraAccountMetaList PDA already exists
  const extraAccountMetasPda = getExtraAccountMetasPda(mint);
  const existingAccount = await connection.getAccountInfo(extraAccountMetasPda);
  if (existingAccount) {
    console.log(`  Route ${routeId}: ExtraAccountMetaList already exists for mint ${mint.toBase58()} — skipping`);
    return null;
  }

  // Build the instruction
  const ix = await guardProgram.methods
    .initializeExtraAccountMetaList()
    .accountsPartial({
      payer: executorService.getSigner().publicKey,
      extraAccountMetas: extraAccountMetasPda,
      mint,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const transaction = new Transaction().add(ix);
  const signer = executorService.getSigner();

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [signer],
    { commitment: "confirmed" }
  );

  console.log(`  Route ${routeId}: Initialized ExtraAccountMetaList for mint ${mint.toBase58()} — tx: ${signature}`);
  return signature;
}

async function main() {
  // Parse route IDs from env or CLI args
  const envRouteIds = process.env.ROUTE_IDS;
  const cliArgs = process.argv.slice(2);

  let routeIds: number[];
  if (cliArgs.length > 0) {
    routeIds = cliArgs.map((id) => parseInt(id, 10));
  } else if (envRouteIds) {
    routeIds = envRouteIds.split(",").map((id) => parseInt(id.trim(), 10));
  } else {
    console.error("No route IDs provided. Pass them as CLI args or set ROUTE_IDS env var.");
    console.error("Usage: npx tsx backfill-extra-account-metas.ts 2048 2049 2050");
    process.exit(1);
  }

  // Validate
  for (const id of routeIds) {
    if (isNaN(id)) {
      console.error(`Invalid route ID: ${id}`);
      process.exit(1);
    }
  }

  console.log(`Backfilling ExtraAccountMetaList for ${routeIds.length} route(s): ${routeIds.join(", ")}`);
  console.log(`Payer: ${executorService.getSigner().publicKey.toBase58()}`);
  console.log();

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const routeId of routeIds) {
    try {
      const sig = await backfillRoute(routeId);
      if (sig) success++;
      else skipped++;
    } catch (error: any) {
      console.error(`  Route ${routeId}: FAILED — ${error.message}`);
      failed++;
    }
  }

  console.log();
  console.log(`Done. Initialized: ${success}, Skipped: ${skipped}, Failed: ${failed}`);
}

main();
