/**
 * Script to fetch (read-only) the SOL token configuration from mainnet
 *
 * Usage:
 *   npx tsx scripts/fetch-sol-token-config.ts
 *
 * Environment variables:
 *   SOLANA_RPC_URL - RPC endpoint (defaults to mainnet-beta)
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import IDL from "../libs/server/src/solana/idl/multi_hopper_project.json" with { type: "json" };

const PROGRAM_ID = new PublicKey("3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh");

async function main() {
  const rpcUrl =
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

  const connection = new Connection(rpcUrl, "confirmed");

  const [tokenConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_config_global")],
    PROGRAM_ID
  );

  console.log("=== SOL Token Config (Mainnet) ===");
  console.log(`Program ID:       ${PROGRAM_ID.toBase58()}`);
  console.log(`Token Config PDA: ${tokenConfigPda.toBase58()}`);
  console.log(`RPC URL:          ${rpcUrl.replace(/api-key=[^&]+/, "api-key=***")}`);
  console.log("");

  const provider = new AnchorProvider(
    connection,
    {
      publicKey: PublicKey.default,
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    } as any,
    {}
  );

  const program = new Program(IDL as any, provider);

  const cfg: any = await program.account.tokenConfig.fetch(tokenConfigPda);

  console.log("Values:");
  console.log(`  creator:          ${cfg.creator?.toBase58?.() ?? "(n/a)"}`);
  console.log(`  minTransfer:      ${cfg.minTransfer.toString()} lamports (${cfg.minTransfer.toNumber() / 1e9} SOL)`);
  console.log(`  feeBps:           ${cfg.feeBps} (${cfg.feeBps / 100}%)`);
  console.log(`  signer/executor:  ${cfg.signer?.toBase58?.() ?? "(n/a)"}`);
  console.log(`  feeTreasury:      ${cfg.feeTreasury.toBase58()}`);
  console.log(`  maxHops:          ${cfg.maxHops}`);
  console.log(`  flatFeeLamports:  ${cfg.flatFeeLamports.toString()} lamports (${cfg.flatFeeLamports.toNumber() / 1e9} SOL)`);
  if (cfg.createdAt) {
    const ts = Number(cfg.createdAt.toString());
    console.log(`  createdAt:        ${ts} (${new Date(ts * 1000).toISOString()})`);
  }

  console.log("\nRaw object keys:", Object.keys(cfg));

  // Scan signatures for the most recent initialize_token_config / update_token_config
  // by checking instruction-data discriminators in each transaction.
  const INIT_DISC = Buffer.from([60, 14, 114, 86, 25, 84, 93, 149]).toString("hex");
  const UPDATE_DISC = Buffer.from([231, 122, 181, 79, 255, 79, 144, 167]).toString("hex");

  console.log("\nScanning signatures for init/update transactions...");

  let before: string | undefined = undefined;
  let pages = 0;
  const maxPages = 20; // safety
  let lastInit: { sig: string; blockTime: number | null } | null = null;
  let lastUpdate: { sig: string; blockTime: number | null } | null = null;

  outer: while (pages < maxPages) {
    pages++;
    const sigs = await connection.getSignaturesForAddress(
      tokenConfigPda,
      { limit: 1000, before }
    );
    if (sigs.length === 0) break;

    for (const s of sigs) {
      if (s.err) continue;
      const tx = await connection.getTransaction(s.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (!tx) continue;

      const message = tx.transaction.message;
      const accountKeys =
        "staticAccountKeys" in message
          ? message.staticAccountKeys
          : (message as any).accountKeys;

      const compiled =
        "compiledInstructions" in message
          ? message.compiledInstructions
          : (message as any).instructions;

      for (const ix of compiled) {
        const programId = accountKeys[ix.programIdIndex];
        if (!programId.equals(PROGRAM_ID)) continue;

        const data: Buffer =
          ix.data instanceof Uint8Array
            ? Buffer.from(ix.data)
            : Buffer.from(
                require("bs58").decode(ix.data as unknown as string)
              );

        const disc = data.slice(0, 8).toString("hex");
        if (disc === INIT_DISC && !lastInit) {
          lastInit = { sig: s.signature, blockTime: s.blockTime ?? null };
        } else if (disc === UPDATE_DISC && !lastUpdate) {
          lastUpdate = { sig: s.signature, blockTime: s.blockTime ?? null };
        }
      }

      if (lastInit && lastUpdate) break outer;
    }

    before = sigs[sigs.length - 1].signature;
    if (sigs.length < 1000) break;
  }

  console.log("");
  if (lastUpdate) {
    const ts = lastUpdate.blockTime;
    console.log(`Last update_token_config:`);
    console.log(`  signature:  ${lastUpdate.sig}`);
    console.log(`  blockTime:  ${ts} (${ts ? new Date(ts * 1000).toISOString() : "n/a"})`);
  } else {
    console.log("No update_token_config call found in scanned signatures.");
  }
  if (lastInit) {
    const ts = lastInit.blockTime;
    console.log(`\nLast initialize_token_config:`);
    console.log(`  signature:  ${lastInit.sig}`);
    console.log(`  blockTime:  ${ts} (${ts ? new Date(ts * 1000).toISOString() : "n/a"})`);
  }
  console.log(`\n(scanned ${pages} page(s) of signatures)`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
