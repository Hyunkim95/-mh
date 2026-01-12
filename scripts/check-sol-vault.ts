import { Connection, PublicKey } from "@solana/web3.js";

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=f6d0c03a-562f-4784-8b78-ebb084b72514";
const connection = new Connection(SOLANA_RPC_URL);

const MULTI_HOPPER_PROGRAM_ID = new PublicKey("3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh");

async function getSolVault(creator: string) {
  const [solVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault"), new PublicKey(creator).toBuffer()],
    MULTI_HOPPER_PROGRAM_ID
  );
  return solVault;
}

async function checkSolVaults() {
  const creator = "93AceAmSTY4sCkdwnaExuUj8nmaCVKijDHCABx49pTFw";

  console.log(`\n========== Checking SOL Vault ==========`);
  console.log(`Creator: ${creator}`);

  const solVault = await getSolVault(creator);
  console.log(`SOL Vault PDA: ${solVault.toBase58()}`);

  const balance = await connection.getBalance(solVault);
  console.log(`SOL Vault Balance: ${balance / 1e9} SOL`);

  // Check account info
  const accountInfo = await connection.getAccountInfo(solVault);
  if (accountInfo) {
    console.log(`Account exists: Yes`);
    console.log(`Owner: ${accountInfo.owner.toBase58()}`);
    console.log(`Lamports: ${accountInfo.lamports}`);
  } else {
    console.log(`Account exists: No`);
  }
}

checkSolVaults().catch(console.error);
