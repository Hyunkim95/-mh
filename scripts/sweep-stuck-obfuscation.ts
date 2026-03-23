/**
 * Sweep stuck SOL from failed obfuscation sessions (routes 2443-2446)
 *
 * These routes failed deployment because aggregation/cleanup fees ate into
 * the route amount. This script recovers all SOL from the custodial wallets
 * (4 Wallet X + ~27 intermediate wallets) back to Kuj's wallet.
 *
 * Usage:
 *   DATABASE_URL=<url> WALLET_ENCRYPTION_KEY=<key> SOLANA_RPC_URL=<rpc> npx tsx scripts/sweep-stuck-obfuscation.ts
 *
 * Add --execute flag to actually send transactions (dry-run by default).
 *
 * Run on Heroku:
 *   heroku run "npx tsx scripts/sweep-stuck-obfuscation.ts --execute" -a multihopper-prod
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { eq, inArray } from "drizzle-orm";
import bs58 from "bs58";
import { createHash, createDecipheriv } from "crypto";
import { obfuscationSessionsSchema } from "../libs/server/src/obfuscation/schema/obfuscation.schema";
import { intermediateWalletsSchema } from "../libs/server/src/obfuscation/schema/obfuscation.schema";
import { custodialWalletsSchema } from "../libs/crypto-utils/src/schema";
import { routesSchema } from "../libs/server/src/routes/schema/route.schema";

// Kuj's wallet — destination for all recovered SOL
const DESTINATION_WALLET = new PublicKey(
  "FwKkNDV5JV7i3rSmwbAQvjXSChV1yNDhSif3G3krGWTq",
);

// Routes to sweep
const ROUTE_IDS = [2443, 2444, 2445, 2446];

// Base tx fee — use 0 priority fee to maximize recovery
const BASE_TX_FEE = 5000;

function decryptPrivateKey(encrypted: string, iv: string, encryptionKey: string): string {
  const key = createHash("sha256").update(encryptionKey).digest();
  const ivBuffer = Buffer.from(iv, "hex");
  const decipher = createDecipheriv("aes-256-cbc", key, ivBuffer);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function getKeypairFromDecryptedKey(privateKeyString: string): Keypair {
  const privateKeyBytes = bs58.decode(privateKeyString);
  return Keypair.fromSecretKey(privateKeyBytes);
}

async function main() {
  const isDryRun = !process.argv.includes("--execute");

  console.log("=== Sweep Stuck Obfuscation SOL ===\n");
  console.log(`Routes: ${ROUTE_IDS.join(", ")}`);
  console.log(`Destination: ${DESTINATION_WALLET.toBase58()}`);
  if (isDryRun) {
    console.log("\nDRY RUN MODE — add --execute flag to send transactions\n");
  } else {
    console.log("\nEXECUTE MODE — transactions will be sent!\n");
  }

  // Validate env vars
  const databaseUrl = process.env.DATABASE_URL;
  const encryptionKey = process.env.WALLET_ENCRYPTION_KEY || ""; // matches prod default
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  // Connect to DB
  const pgClient = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await pgClient.connect();
  const db = drizzle(pgClient);

  // Connect to Solana
  const connection = new Connection(rpcUrl, "confirmed");

  // 1. Find all obfuscation sessions for these routes
  const sessions = await db
    .select()
    .from(obfuscationSessionsSchema)
    .where(inArray(obfuscationSessionsSchema.routeId, ROUTE_IDS));

  console.log(`Found ${sessions.length} obfuscation sessions\n`);

  if (sessions.length === 0) {
    console.log("No sessions found — nothing to sweep.");
    await pgClient.end();
    return;
  }

  let totalRecovered = 0;
  let totalWallets = 0;
  let failedWallets = 0;

  for (const session of sessions) {
    console.log(`--- Route ${session.routeId} (session ${session.id}, status: ${session.status}) ---`);

    // Collect all wallet IDs to sweep: Wallet X + intermediate wallets
    const walletIds: number[] = [];

    // Add Wallet X
    if (session.walletXId) {
      walletIds.push(session.walletXId);
    }

    // Get intermediate wallets
    const intermediateWallets = await db
      .select()
      .from(intermediateWalletsSchema)
      .where(eq(intermediateWalletsSchema.sessionId, session.id));

    for (const iw of intermediateWallets) {
      walletIds.push(iw.custodialWalletId);
    }

    console.log(`  Wallets to sweep: 1 Wallet X + ${intermediateWallets.length} intermediate = ${walletIds.length} total`);

    // Fetch custodial wallet records
    const custodialWallets = await db
      .select()
      .from(custodialWalletsSchema)
      .where(inArray(custodialWalletsSchema.id, walletIds));

    for (const wallet of custodialWallets) {
      const isWalletX = wallet.id === session.walletXId;
      const label = isWalletX ? "Wallet X" : "Intermediate";

      try {
        const balance = await connection.getBalance(new PublicKey(wallet.address));

        if (balance <= BASE_TX_FEE) {
          console.log(`  [${label}] ${wallet.address}: ${balance} lamports — skip (too low)`);
          continue;
        }

        const transferAmount = balance - BASE_TX_FEE;
        console.log(
          `  [${label}] ${wallet.address}: ${(balance / 1e9).toFixed(6)} SOL -> transfer ${(transferAmount / 1e9).toFixed(6)} SOL`,
        );

        if (!isDryRun) {
          // Decrypt and build keypair
          const privateKeyString = decryptPrivateKey(
            wallet.encryptedPrivateKey,
            wallet.iv,
            encryptionKey,
          );
          const keypair = getKeypairFromDecryptedKey(privateKeyString);

          // Build and send transaction
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: keypair.publicKey,
              toPubkey: DESTINATION_WALLET,
              lamports: transferAmount,
            }),
          );

          const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);
          console.log(`    TX: ${signature}`);
        }

        totalRecovered += transferAmount;
        totalWallets++;
      } catch (error: any) {
        console.error(`  [${label}] ${wallet.address}: FAILED — ${error.message}`);
        failedWallets++;
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Wallets swept: ${totalWallets}`);
  console.log(`Failed: ${failedWallets}`);
  console.log(`Total recovered: ${(totalRecovered / 1e9).toFixed(6)} SOL`);

  if (isDryRun) {
    console.log("\nDRY RUN — no transactions sent. Re-run with --execute to send.");
  }

  // 2. Update DB status for these sessions + routes
  if (!isDryRun && totalWallets > 0) {
    console.log("\nUpdating database statuses...");

    for (const session of sessions) {
      // Mark session as failed with cleanup completed
      await db
        .update(obfuscationSessionsSchema)
        .set({
          status: "failed",
          lastError: "Swept by sweep-stuck-obfuscation script — SOL fee shortfall bug",
          completedAt: new Date(),
        })
        .where(eq(obfuscationSessionsSchema.id, session.id));

      // Mark all intermediate wallets as cleanup completed
      await db
        .update(intermediateWalletsSchema)
        .set({
          cleanupStatus: "completed",
          cleanedUpAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(intermediateWalletsSchema.sessionId, session.id));

      // Mark route as failed
      await db
        .update(routesSchema)
        .set({
          status: "failed",
          deploymentError: "Obfuscation SOL fee shortfall — funds recovered via sweep script",
          updatedAt: new Date(),
        })
        .where(eq(routesSchema.id, session.routeId));

      console.log(`  Route ${session.routeId}: session -> failed, wallets -> cleanup completed, route -> failed`);
    }

    console.log("Database updates complete.");
  }

  await pgClient.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
