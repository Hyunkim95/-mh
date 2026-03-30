import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

export async function airdrop(
  connection: Connection,
  recipient: PublicKey,
  solAmount: number = 100
): Promise<void> {
  const target = solAmount * LAMPORTS_PER_SOL;
  let balance = await connection.getBalance(recipient);
  if (balance >= target) return;

  // Airdrop in chunks, polling balance instead of confirming signatures
  while (balance < target) {
    const chunk = Math.min(2, (target - balance) / LAMPORTS_PER_SOL);
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await connection.requestAirdrop(
          recipient,
          chunk * LAMPORTS_PER_SOL
        );
        break;
      } catch (err) {
        if (attempt === 5) throw err;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // Poll for balance change instead of confirming the tx signature
    const deadline = Date.now() + 30_000;
    const prev = balance;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      balance = await connection.getBalance(recipient);
      if (balance > prev) break;
    }
    if (balance <= prev) {
      throw new Error(`Airdrop not reflected after 30s (balance: ${balance})`);
    }
  }
}
