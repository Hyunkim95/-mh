/**
 * Script to update the SOL token configuration on-chain
 *
 * Usage:
 *   npx tsx scripts/update-sol-token-config.ts
 *
 * Environment variables:
 *   ADMIN_PRIVATE_KEY - Base58 encoded private key of the admin wallet
 *   SOLANA_RPC_URL - RPC endpoint (defaults to mainnet)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import bs58 from "bs58";
import * as IDL from "../libs/server/src/solana/idl/multi_hopper_project.json";

// Configuration - Set the fields you want to update
// Set to null to keep existing value
const UPDATE_CONFIG = {
  // Minimum transfer amount in lamports (null = keep existing)
  minTransfer: null as BN | null,
  // Fee in basis points (null = keep existing)
  feeBps: null as number | null,
  // Treasury wallet to receive fees (null = keep existing)
  feeTreasury: null as PublicKey | null,
  // Maximum number of hops per route (UPDATE THIS!)
  maxHops: 50, // Increased from 10 to 50 to support larger routes
  // Flat fee in lamports (null = keep existing)
  flatFeeLamports: null as BN | null,
};

const PROGRAM_ID = new PublicKey("3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh");

async function main() {
  console.log("=== SOL Token Config Update Script ===\n");

  // Check for required environment variables
  const privateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Error: ADMIN_PRIVATE_KEY environment variable is required");
    console.log("\nUsage:");
    console.log(
      "  ADMIN_PRIVATE_KEY=<base58-private-key> npx tsx scripts/update-sol-token-config.ts"
    );
    process.exit(1);
  }

  const rpcUrl =
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

  // Create connection and wallet
  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));

  console.log("Configuration:");
  console.log(`  RPC URL: ${rpcUrl}`);
  console.log(`  Admin Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`  Program ID: ${PROGRAM_ID.toBase58()}`);

  // Derive the token config PDA
  const [tokenConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_config_global")],
    PROGRAM_ID
  );
  console.log(`  Token Config PDA: ${tokenConfigPda.toBase58()}`);

  // Check if the token config exists
  console.log("\nChecking if token config exists...");
  const accountInfo = await connection.getAccountInfo(tokenConfigPda);
  if (!accountInfo) {
    console.error(
      "Error: Token config does not exist. Run initialize-sol-token-config.ts first."
    );
    process.exit(1);
  }
  console.log("✅ Token config exists.");

  // Build the program
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: wallet.publicKey,
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    } as any,
    {}
  );

  const program = new Program(IDL as any, provider);

  // Fetch current config
  console.log("\nFetching current token config...");
  const currentConfig = await program.account.tokenConfig.fetch(tokenConfigPda);
  console.log("Current values:");
  console.log(
    `  Min Transfer: ${currentConfig.minTransfer.toString()} lamports (${currentConfig.minTransfer.toNumber() / 1e9} SOL)`
  );
  console.log(
    `  Fee BPS: ${currentConfig.feeBps} (${currentConfig.feeBps / 100}%)`
  );
  console.log(`  Fee Treasury: ${currentConfig.feeTreasury.toBase58()}`);
  console.log(`  Max Hops: ${currentConfig.maxHops}`);
  console.log(
    `  Flat Fee: ${currentConfig.flatFeeLamports.toString()} lamports (${currentConfig.flatFeeLamports.toNumber() / 1e9} SOL)`
  );

  // Check wallet balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`\nWallet balance: ${balance / 1e9} SOL`);
  if (balance < 0.01 * 1e9) {
    console.error(
      "Error: Insufficient balance. Need at least 0.01 SOL for fees."
    );
    process.exit(1);
  }

  // Display updates to be applied
  console.log("\nUpdates to be applied:");
  if (UPDATE_CONFIG.minTransfer !== null) {
    console.log(
      `  Min Transfer: ${UPDATE_CONFIG.minTransfer.toString()} lamports (${UPDATE_CONFIG.minTransfer.toNumber() / 1e9} SOL)`
    );
  }
  if (UPDATE_CONFIG.feeBps !== null) {
    console.log(
      `  Fee BPS: ${UPDATE_CONFIG.feeBps} (${UPDATE_CONFIG.feeBps / 100}%)`
    );
  }
  if (UPDATE_CONFIG.feeTreasury !== null) {
    console.log(`  Fee Treasury: ${UPDATE_CONFIG.feeTreasury.toBase58()}`);
  }
  if (UPDATE_CONFIG.maxHops !== null) {
    console.log(`  Max Hops: ${currentConfig.maxHops} → ${UPDATE_CONFIG.maxHops}`);
  }
  if (UPDATE_CONFIG.flatFeeLamports !== null) {
    console.log(
      `  Flat Fee: ${UPDATE_CONFIG.flatFeeLamports.toString()} lamports (${UPDATE_CONFIG.flatFeeLamports.toNumber() / 1e9} SOL)`
    );
  }

  // Build the update token config instruction
  console.log("\nBuilding transaction...");
  const updateIx = await program.methods
    .updateTokenConfig(
      UPDATE_CONFIG.minTransfer,
      UPDATE_CONFIG.feeBps,
      wallet.publicKey, // signer/executor
      UPDATE_CONFIG.feeTreasury,
      UPDATE_CONFIG.maxHops,
      UPDATE_CONFIG.flatFeeLamports
    )
    .accounts({
      tokenConfig: tokenConfigPda,
      creator: wallet.publicKey,
    })
    .instruction();

  // Build transaction with priority fees
  const transaction = new Transaction();

  // Add compute budget instructions for priority
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
  );

  transaction.add(updateIx);

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  console.log("Transaction built successfully");

  // Sign and send transaction
  console.log("\nSigning and sending transaction...");
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      {
        commitment: "confirmed",
        maxRetries: 3,
      }
    );

    console.log("\n✅ Success! Token config updated.");
    console.log(`  Transaction signature: ${signature}`);
    console.log(`  Explorer: https://solscan.io/tx/${signature}`);
  } catch (error) {
    console.error("\n❌ Transaction failed:", error);
    process.exit(1);
  }

  // Verify the update
  console.log("\nVerifying updated token config...");
  const updatedConfig = await program.account.tokenConfig.fetch(tokenConfigPda);
  console.log("Updated values:");
  console.log(
    `  Min Transfer: ${updatedConfig.minTransfer.toString()} lamports`
  );
  console.log(`  Fee BPS: ${updatedConfig.feeBps}`);
  console.log(`  Fee Treasury: ${updatedConfig.feeTreasury.toBase58()}`);
  console.log(`  Max Hops: ${updatedConfig.maxHops}`);
  console.log(
    `  Flat Fee: ${updatedConfig.flatFeeLamports.toString()} lamports`
  );

  if (UPDATE_CONFIG.maxHops !== null && updatedConfig.maxHops === UPDATE_CONFIG.maxHops) {
    console.log("\n✅ MaxHops successfully updated!");
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
