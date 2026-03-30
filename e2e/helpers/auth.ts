/**
 * Wallet authentication helper for E2E tests.
 * Replicates what Phantom wallet does: sign a challenge message.
 */

import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { decodeUTF8 } from "tweetnacl-util";
import bs58 from "bs58";
import { apiClient } from "./api-client";

/**
 * Authenticate with the API using a Solana keypair.
 * Returns the JWT token and sets it on the apiClient.
 */
export async function authenticateWallet(wallet: Keypair): Promise<string> {
  // 1. Get challenge from API
  const challenge = await apiClient.mutation<{
    nonce: string;
    message: string;
  }>("auth.createMessage");

  // 2. Sign the message with our keypair (same as Phantom would)
  const messageBytes = decodeUTF8(challenge.message);
  const signature = nacl.sign.detached(messageBytes, wallet.secretKey);
  const signatureBase58 = bs58.encode(signature);

  // 3. Verify signature and get JWT
  const result = await apiClient.mutation<{ token: string }>(
    "auth.verifyUserWithSignature",
    {
      nonce: challenge.nonce,
      address: wallet.publicKey.toBase58(),
      signature: signatureBase58,
      isHardwareWallet: false,
    }
  );

  // 4. Set token on client for subsequent requests
  apiClient.setToken(result.token);

  return result.token;
}
