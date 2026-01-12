/**
 * Script to initialize the SOL token configuration on-chain
 *
 * Usage:
 *   npx tsx scripts/initialize-sol-token-config.ts
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
  SystemProgram,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import bs58 from "bs58";
import * as IDL from "../libs/server/src/solana/idl/multi_hopper_project.json";

// Configuration - modify these values as needed
const CONFIG = {
  // Minimum transfer amount in lamports (0.001 SOL = 1,000,000 lamports)
  minTransfer: new BN(1_000_000),
  // Fee in basis points (100 = 1%)
  feeBps: 100,
  // Treasury wallet to receive fees
  feeTreasury: new PublicKey("7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P"),
  // Maximum number of hops per route
  maxHops: 10,
  // Flat fee in lamports (0.00001 SOL = 10,000 lamports)
  flatFeeLamports: new BN(10_000),
};

const PROGRAM_ID = new PublicKey("3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh");

async function main() {
  console.log("=== SOL Token Config Initialization Script ===\n");

  // Check for required environment variables
  const privateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Error: ADMIN_PRIVATE_KEY environment variable is required");
    console.log("\nUsage:");
    console.log("  ADMIN_PRIVATE_KEY=<base58-private-key> npx tsx scripts/initialize-sol-token-config.ts");
    process.exit(1);
  }

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

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

  // Check if the token config already exists
  console.log("\nChecking if token config already exists...");
  const accountInfo = await connection.getAccountInfo(tokenConfigPda);
  if (accountInfo) {
    console.log("Token config already exists! No action needed.");
    console.log(`  Account size: ${accountInfo.data.length} bytes`);
    console.log(`  Owner: ${accountInfo.owner.toBase58()}`);
    process.exit(0);
  }
  console.log("Token config does not exist. Proceeding with initialization...");

  // Check wallet balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`\nWallet balance: ${balance / 1e9} SOL`);
  if (balance < 0.01 * 1e9) {
    console.error("Error: Insufficient balance. Need at least 0.01 SOL for rent and fees.");
    process.exit(1);
  }

  // Display config to be set
  console.log("\nToken Config to be initialized:");
  console.log(`  Min Transfer: ${CONFIG.minTransfer.toString()} lamports (${CONFIG.minTransfer.toNumber() / 1e9} SOL)`);
  console.log(`  Fee BPS: ${CONFIG.feeBps} (${CONFIG.feeBps / 100}%)`);
  console.log(`  Fee Treasury: ${CONFIG.feeTreasury.toBase58()}`);
  console.log(`  Max Hops: ${CONFIG.maxHops}`);
  console.log(`  Flat Fee: ${CONFIG.flatFeeLamports.toString()} lamports (${CONFIG.flatFeeLamports.toNumber() / 1e9} SOL)`);

  // Build the program
  console.log("\nBuilding transaction...");
  const provider = new AnchorProvider(connection, {
    publicKey: wallet.publicKey,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  } as any, {});

  const program = new Program(IDL as any, provider);

  // Build the initialize token config instruction
  const initializeIx = await program.methods
    .initializeTokenConfig(
      CONFIG.minTransfer,
      CONFIG.feeBps,
      wallet.publicKey, // signer/executor
      CONFIG.feeTreasury,
      CONFIG.maxHops,
      CONFIG.flatFeeLamports
    )
    .accounts({
      creator: wallet.publicKey,
      tokenConfig: tokenConfigPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  // Build transaction with priority fees
  const transaction = new Transaction();

  // Add compute budget instructions for priority
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
  );

  transaction.add(initializeIx);

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  console.log("Transaction built successfully");
  console.log(`  Blockhash: ${blockhash}`);

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

    console.log("\n✅ Success! Token config initialized.");
    console.log(`  Transaction signature: ${signature}`);
    console.log(`  Explorer: https://solscan.io/tx/${signature}`);
  } catch (error) {
    console.error("\n❌ Transaction failed:", error);
    process.exit(1);
  }

  // Verify the token config was created
  console.log("\nVerifying token config...");
  const verifyAccountInfo = await connection.getAccountInfo(tokenConfigPda);
  if (verifyAccountInfo) {
    console.log("✅ Token config account verified!");
    console.log(`  Account size: ${verifyAccountInfo.data.length} bytes`);
  } else {
    console.error("❌ Token config account not found after transaction. Please check the transaction.");
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
