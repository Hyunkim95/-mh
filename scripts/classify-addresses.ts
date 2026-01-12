import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

type AccountType = "program" | "token_mint" | "wallet" | "token_account" | "unknown" | "not_found";

interface ClassifiedAddress {
  address: string;
  transactionsPerDay: number;
  type: AccountType;
  owner?: string;
}

function classifyAccountInfo(accountInfo: AccountInfo<Buffer> | null): AccountType {
  if (!accountInfo) {
    return "not_found";
  }

  // Check if it's a program (executable)
  if (accountInfo.executable) {
    return "program";
  }

  const owner = accountInfo.owner.toBase58();

  // Check if it's a token mint or token account (owned by Token Program)
  if (owner === TOKEN_PROGRAM_ID || owner === TOKEN_2022_PROGRAM_ID) {
    // Token mints are 82 bytes for SPL Token, 165 bytes for Token-2022
    if (accountInfo.data.length === 82 || accountInfo.data.length === 165) {
      return "token_mint";
    }
    // Token accounts are 165 bytes for SPL Token
    return "token_account";
  }

  // Check if it's a wallet (owned by System Program)
  if (owner === SYSTEM_PROGRAM_ID) {
    return "wallet";
  }

  return "unknown";
}

async function main() {
  // Use Helius mainnet RPC for better rate limits
  const rpcUrl = process.env.RPC_URL || "https://mainnet.helius-rpc.com/?api-key=f6d0c03a-562f-4784-8b78-ebb084b72514";
  const connection = new Connection(rpcUrl, "confirmed");

  // Read CSV
  const csvPath = path.join(__dirname, "../500wallets.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n").filter((line) => line.trim());

  // Skip header and parse
  const addresses = lines.slice(1).map((line) => {
    const [address, txPerDay] = line.split(",");
    return { address: address.trim(), transactionsPerDay: parseInt(txPerDay) || 0 };
  });

  console.log(`Classifying ${addresses.length} addresses using batched RPC calls...`);
  console.log(`RPC: ${rpcUrl.substring(0, 50)}...`);

  const results: ClassifiedAddress[] = [];
  const summary = {
    program: 0,
    token_mint: 0,
    wallet: 0,
    token_account: 0,
    unknown: 0,
    not_found: 0,
  };

  // Use getMultipleAccountsInfo for batching - max 100 per call
  const batchSize = 100;
  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    const pubkeys = batch.map(({ address }) => new PublicKey(address));

    try {
      const accountInfos = await connection.getMultipleAccountsInfo(pubkeys);

      for (let j = 0; j < batch.length; j++) {
        const type = classifyAccountInfo(accountInfos[j]);
        summary[type]++;
        results.push({
          address: batch[j].address,
          transactionsPerDay: batch[j].transactionsPerDay,
          type,
          owner: accountInfos[j]?.owner.toBase58(),
        });
      }

      console.log(`Processed ${Math.min(i + batchSize, addresses.length)}/${addresses.length}`);
    } catch (error) {
      console.error(`Error processing batch starting at ${i}:`, error);
      // Mark all as unknown on error
      for (const item of batch) {
        summary.unknown++;
        results.push({ address: item.address, transactionsPerDay: item.transactionsPerDay, type: "unknown" });
      }
    }

    // Small delay between batches
    if (i + batchSize < addresses.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // Output results
  console.log("\n========== SUMMARY ==========");
  console.log(`Programs:       ${summary.program}`);
  console.log(`Token Mints:    ${summary.token_mint}`);
  console.log(`Wallets:        ${summary.wallet}`);
  console.log(`Token Accounts: ${summary.token_account}`);
  console.log(`Unknown:        ${summary.unknown}`);
  console.log(`Not Found:      ${summary.not_found}`);
  console.log("==============================\n");

  // Save detailed results
  const outputPath = path.join(__dirname, "../classified-addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify({ summary, results }, null, 2));
  console.log(`Detailed results saved to: ${outputPath}`);

  // Create separate CSVs for each type
  const tokenMints = results.filter((r) => r.type === "token_mint");
  const wallets = results.filter((r) => r.type === "wallet");
  const programs = results.filter((r) => r.type === "program");

  if (tokenMints.length > 0) {
    const mintsCsv = "Address,Transactions per day\n" + tokenMints.map((r) => `${r.address},${r.transactionsPerDay}`).join("\n");
    fs.writeFileSync(path.join(__dirname, "../token-mints.csv"), mintsCsv);
    console.log(`✓ Token mints: token-mints.csv (${tokenMints.length} addresses)`);
  }

  if (wallets.length > 0) {
    const walletsCsv = "Address,Transactions per day\n" + wallets.map((r) => `${r.address},${r.transactionsPerDay}`).join("\n");
    fs.writeFileSync(path.join(__dirname, "../wallets-only.csv"), walletsCsv);
    console.log(`✓ Wallets: wallets-only.csv (${wallets.length} addresses)`);
  }

  if (programs.length > 0) {
    const programsCsv = "Address,Transactions per day\n" + programs.map((r) => `${r.address},${r.transactionsPerDay}`).join("\n");
    fs.writeFileSync(path.join(__dirname, "../programs-only.csv"), programsCsv);
    console.log(`✓ Programs: programs-only.csv (${programs.length} addresses)`);
  }
}

main().catch(console.error);
