import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import crypto from "crypto";

export const SOLANA_RPC_URL = "http://localhost:8899";
export const API_URL = "http://localhost:3001";

// Deterministic test payer (same seed in global-setup.ts)
const TEST_PAYER_SEED = crypto
  .createHash("sha256")
  .update("e2e_test_payer")
  .digest()
  .slice(0, 32);
export const testPayer = Keypair.fromSeed(TEST_PAYER_SEED);

// Direct Solana connection (for sending signed txs + checking balances)
export const connection = new Connection(SOLANA_RPC_URL, "confirmed");
