import { describe, it, expect, beforeAll } from "vitest";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { connection, testPayer } from "./setup/test-context";
import { airdrop } from "./helpers/airdrop";
import { apiClient } from "./helpers/api-client";
import { authenticateWallet } from "./helpers/auth";
import { signAndSendTransaction } from "./helpers/tx-signer";

describe("Intermediate wallet cleanup", () => {
  const HOP_AMOUNT_SOL = 0.05;
  const HOP_AMOUNT_LAMPORTS = String(
    Math.floor(HOP_AMOUNT_SOL * LAMPORTS_PER_SOL)
  );

  let destination: Keypair;
  let routeDbId: number;
  let intermediateWalletAddresses: string[] = [];

  beforeAll(async () => {
    destination = Keypair.generate();

    const balance = await connection.getBalance(testPayer.publicKey);
    if (balance < 10 * LAMPORTS_PER_SOL) {
      await airdrop(connection, testPayer.publicKey, 100);
    }

    await authenticateWallet(testPayer);
  });

  it("should ensure token config exists on-chain", async () => {
    try {
      const existing = await apiClient.query("contract.getTokenConfigSOL", {
        creator: testPayer.publicKey.toBase58(),
      });
      if (existing.data) return;
    } catch {
      // Not found, create it
    }

    const result = await apiClient.mutation(
      "contract.initializeTokenConfigSOL",
      {
        creator: testPayer.publicKey.toBase58(),
        tokenConfig: {
          minTransfer: "1000000",
          feeBps: "100",
          feeTreasury: testPayer.publicKey.toBase58(),
          maxHops: "10",
          maxDelaySeconds: "0",
          timelockSeconds: "0",
          flatFeeLamports: "10000",
        },
      }
    );

    expect(result.success).toBe(true);
    try {
      await signAndSendTransaction(result.data.transaction, testPayer);
    } catch {
      // Account may already exist on-chain
    }
  });

  it("should create route", async () => {
    const arrivalTime = new Date(Date.now() + 5 * 60_000);

    const result = await apiClient.mutation("easyRoutes.create", {
      arrivalTime: arrivalTime.toISOString(),
      hopCount: 3,
      destinationWallet: destination.publicKey.toBase58(),
      tokenType: "SOL",
      tokenDecimals: 9,
      hopAmountTokens: String(HOP_AMOUNT_SOL),
      hopAmountRaw: HOP_AMOUNT_LAMPORTS,
      creator: testPayer.publicKey.toBase58(),
    });

    expect(result.success).toBe(true);
    routeDbId = result.data.id;
  });

  it("should fund obfuscation and capture intermediate wallet addresses", async () => {
    const fundingResult = await apiClient.mutation(
      "routes.getObfuscationFundingTransactions",
      {
        routeId: routeDbId,
        creator: testPayer.publicKey.toBase58(),
      }
    );

    expect(fundingResult.success).toBe(true);

    // Capture intermediate wallet addresses so we can check them after cleanup
    intermediateWalletAddresses = fundingResult.data.transactions.map(
      (tx: any) => tx.destinationAddress
    );

    const fundingResults: Array<{ walletIndex: number; txHash: string }> = [];
    for (const tx of fundingResult.data.transactions) {
      const txHash = await signAndSendTransaction(tx.serialized, testPayer);
      fundingResults.push({ walletIndex: tx.walletIndex, txHash });
    }

    const confirmResult = await apiClient.mutation(
      "routes.confirmAllObfuscationFunding",
      { routeId: routeDbId, fundingResults }
    );

    expect(confirmResult.success).toBe(true);
    expect(confirmResult.data.allFunded).toBe(true);
  });

  it("should wait for obfuscation to complete", async () => {
    let status = "";
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await apiClient.query("routes.getObfuscationStatus", {
        routeId: routeDbId,
      });
      status = result.data?.status || "";
      if (status === "completed") break;
      if (status === "failed") throw new Error("Obfuscation failed");
      await new Promise((r) => setTimeout(r, 3000));
    }
    expect(status).toBe("completed");
  }, 200_000);

  it("intermediate wallets should be drained to 0 after cleanup", async () => {
    // Wait a few seconds for cleanup transactions to finalize
    await new Promise((r) => setTimeout(r, 5000));

    for (const address of intermediateWalletAddresses) {
      const balance = await connection.getBalance(new PublicKey(address));
      expect(balance).toBe(0);
    }
  });
});
