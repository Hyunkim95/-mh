import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=f6d0c03a-562f-4784-8b78-ebb084b72514";
const connection = new Connection(SOLANA_RPC_URL);

async function checkExecutorBalances(routeId: number, executorAddress: string, routeTokenMint: string) {
  console.log(`\n========== Checking Executor for Route ${routeId} ==========`);
  console.log(`Executor: ${executorAddress}`);
  console.log(`Route Token Mint: ${routeTokenMint}`);

  const executor = new PublicKey(executorAddress);
  const routeMint = new PublicKey(routeTokenMint);

  // Check SOL balance
  const solBalance = await connection.getBalance(executor);
  console.log(`\nSOL Balance: ${solBalance / 1e9} SOL`);

  // Check route token balance
  try {
    const routeTokenAccount = await getAssociatedTokenAddress(
      routeMint,
      executor,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`Route Token Account: ${routeTokenAccount.toBase58()}`);

    const accountInfo = await connection.getTokenAccountBalance(routeTokenAccount);
    console.log(`Route Token Balance: ${accountInfo.value.uiAmount || 0} tokens`);
  } catch (error) {
    console.log(`Route Token Account: Not found or error`);
  }
}

async function checkUserBalance(userAddress: string, routeTokenMint: string) {
  console.log(`\n========== Checking User Balance ==========`);
  console.log(`User: ${userAddress}`);
  console.log(`Route Token Mint: ${routeTokenMint}`);

  const user = new PublicKey(userAddress);
  const routeMint = new PublicKey(routeTokenMint);

  // Check SOL balance
  const solBalance = await connection.getBalance(user);
  console.log(`\nSOL Balance: ${solBalance / 1e9} SOL`);

  // Check route token balance
  try {
    const routeTokenAccount = await getAssociatedTokenAddress(
      routeMint,
      user,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`Route Token Account: ${routeTokenAccount.toBase58()}`);

    const accountInfo = await connection.getTokenAccountBalance(routeTokenAccount);
    console.log(`Route Token Balance: ${accountInfo.value.uiAmount || 0} tokens`);
  } catch (error) {
    console.log(`Route Token Account: Not found or error`);
  }
}

async function main() {
  // Route 1027
  await checkExecutorBalances(
    1027,
    "9pTi3LXgTV6SZLjuNh2vVsSQ4gf3k4iPNj8MJxBU2vRU",
    "uQDJjhk5fJMZoMV3xrbN2u7QHKWLmUU8zo9u7aErBcs"
  );

  await checkUserBalance(
    "93AceAmSTY4sCkdwnaExuUj8nmaCVKijDHCABx49pTFw",
    "uQDJjhk5fJMZoMV3xrbN2u7QHKWLmUU8zo9u7aErBcs"
  );

  console.log("\n" + "=".repeat(50));

  // Route 1031
  await checkExecutorBalances(
    1031,
    "5tX2yvUHveSSroQbhx8PXsAf7Q4GEWxCdpANPvbdwUUy",
    "EPoPzX9wuCwC3MARHqCivYu4j8cZDeJ1tJa9WR8TZva5"
  );

  await checkUserBalance(
    "93AceAmSTY4sCkdwnaExuUj8nmaCVKijDHCABx49pTFw",
    "EPoPzX9wuCwC3MARHqCivYu4j8cZDeJ1tJa9WR8TZva5"
  );

  // Check hops for route 1031
  console.log("\n========== Checking Hop Recipients for Route 1031 ==========");
  await checkUserBalance(
    "3BLjRcxWGtR7WRshJ3hL25U3RjWr5Ud98wMcczQqk4Ei",
    "EPoPzX9wuCwC3MARHqCivYu4j8cZDeJ1tJa9WR8TZva5"
  );
  await checkUserBalance(
    "5UHMyYf1Md9dWfXEWGyaAv6uanMVvfKc9fkcbaL5yDYp",
    "EPoPzX9wuCwC3MARHqCivYu4j8cZDeJ1tJa9WR8TZva5"
  );
}

main().catch(console.error);
