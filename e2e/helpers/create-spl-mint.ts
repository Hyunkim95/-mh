import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

export async function createTestSplMint(
  connection: Connection,
  payer: Keypair,
  decimals: number = 6
): Promise<PublicKey> {
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey, // mintAuthority
    payer.publicKey, // freezeAuthority
    decimals
  );
  console.log(`Test SPL mint created: ${mint.toBase58()}`);
  return mint;
}

export async function mintTestTokens(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  destination: PublicKey,
  amount: number
): Promise<void> {
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    destination
  );
  await mintTo(connection, payer, mint, ata.address, payer, amount);
  console.log(`Minted ${amount} tokens to ${destination.toBase58()}`);
}
