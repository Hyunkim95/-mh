import { Connection, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=f6d0c03a-562f-4784-8b78-ebb084b72514";
const connection = new Connection(SOLANA_RPC_URL);

const MULTI_HOPPER_PROGRAM_ID = new PublicKey("3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh");

async function searchForAddHopsTransactions(routeConfigPda: string) {
  console.log(`\n========== Searching for addHops transactions ==========`);
  console.log(`Route Config PDA: ${routeConfigPda}`);

  try {
    const pda = new PublicKey(routeConfigPda);

    // Get signatures for this account
    const signatures = await connection.getSignaturesForAddress(pda, { limit: 20 });

    console.log(`\nFound ${signatures.length} transactions involving this PDA\n`);

    for (const sigInfo of signatures) {
      const tx = await connection.getTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed"
      });

      if (!tx || !tx.meta?.logMessages) continue;

      // Check if this is an addHops transaction
      const isAddHops = tx.meta.logMessages.some(log =>
        log.includes("Instruction: AddHops") ||
        log.includes("add_hops")
      );

      if (isAddHops) {
        console.log(`✅ Found AddHops transaction: ${sigInfo.signature}`);
        console.log(`   Block Time: ${new Date((sigInfo.blockTime || 0) * 1000).toISOString()}`);
        console.log(`   Status: ${tx.meta.err ? "FAILED" : "SUCCESS"}`);
        if (tx.meta.err) {
          console.log(`   Error: ${JSON.stringify(tx.meta.err)}`);
        }
        console.log(`   Logs:`);
        tx.meta.logMessages.forEach(log => console.log(`     ${log}`));
        console.log("");
      } else {
        // Show what instruction it was
        const instructionLog = tx.meta.logMessages.find(log => log.includes("Instruction:"));
        console.log(`- ${sigInfo.signature.substring(0, 20)}... ${instructionLog || "Unknown instruction"} (${new Date((sigInfo.blockTime || 0) * 1000).toISOString()})`);
      }
    }

  } catch (error) {
    console.log("Error searching for transactions:", error);
  }
}

async function main() {
  await searchForAddHopsTransactions("8xcEzzz9o1UNFhcemrEFpWhrCcPkZpFHr7F5WBfdhpcW"); // Route 1027
  await searchForAddHopsTransactions("HdfzdTRmFGigVt1r52naBzzRbs8YcyeCByqXLCeakJJ4"); // Route 1031
}

main().catch(console.error);
