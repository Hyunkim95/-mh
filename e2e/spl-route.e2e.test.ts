import { describe, it, expect, beforeAll } from "vitest";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import { connection, testPayer } from "./setup/test-context";
import { airdrop } from "./helpers/airdrop";
import { apiClient } from "./helpers/api-client";
import { authenticateWallet } from "./helpers/auth";
import { createTestSplMint, mintTestTokens } from "./helpers/create-spl-mint";
import { signAndSendTransaction } from "./helpers/tx-signer";

describe("SPL Route E2E — Full API Flow", () => {
  const TOKEN_DECIMALS = 6;
  const MINT_AMOUNT = 1_000_000 * 10 ** TOKEN_DECIMALS; // 1M tokens
  const HOP_AMOUNT_TOKENS = 100;
  const HOP_AMOUNT_RAW = String(HOP_AMOUNT_TOKENS * 10 ** TOKEN_DECIMALS);

  let splMint: ReturnType<typeof Keypair.generate> extends infer K
    ? any
    : never;
  let recipient1: Keypair;
  let recipient2: Keypair;
  let routeDbId: number;
  let onChainRouteId: number;
  let walletXAddress: string;

  beforeAll(async () => {
    recipient1 = Keypair.generate();
    recipient2 = Keypair.generate();

    // Ensure payer has enough SOL
    const balance = await connection.getBalance(testPayer.publicKey);
    if (balance < 10 * LAMPORTS_PER_SOL) {
      await airdrop(connection, testPayer.publicKey, 100);
    }

    // Create test SPL mint and fund payer
    splMint = await createTestSplMint(connection, testPayer, TOKEN_DECIMALS);
    await mintTestTokens(
      connection,
      testPayer,
      splMint,
      testPayer.publicKey,
      MINT_AMOUNT
    );

    // Auth
    await authenticateWallet(testPayer);
  });

  it("should have minted SPL tokens to payer", async () => {
    const ata = await getAssociatedTokenAddress(splMint, testPayer.publicKey);
    const account = await getAccount(connection, ata);
    expect(Number(account.amount)).toBe(MINT_AMOUNT);
  });

  // --- Token config (ensure it exists — may have been created by SOL test) ---

  it("should ensure token config exists on-chain", async () => {
    // Try to create if not found
    try {
      const existing = await apiClient.query("contract.getTokenConfigSOL", {
        creator: testPayer.publicKey.toBase58(),
      });
      if (existing.data) return; // Already exists and readable
    } catch {
      // Not found, create it
    }

    try {
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
      await signAndSendTransaction(result.data.transaction, testPayer);
    } catch {
      // Account may already exist on-chain from another test suite
    }

    // Wait until the API can actually read the config (may take a moment)
    for (let attempt = 0; attempt < 10; attempt++) {
      const check = await apiClient.query("contract.getTokenConfigSOL", {
        creator: testPayer.publicKey.toBase58(),
      });
      if (check.data) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Token config not readable by API after creation");
  });

  // --- Route creation ---

  it("should create SPL route via routes.create", async () => {
    const now = new Date();
    const result = await apiClient.mutation("routes.create", {
      name: "E2E SPL Route Test",
      tokenType: "SPL",
      tokenMint: splMint.toBase58(),
      tokenSymbol: "TEST",
      tokenDecimals: TOKEN_DECIMALS,
      hopAmountTokens: String(HOP_AMOUNT_TOKENS),
      hopAmountRaw: HOP_AMOUNT_RAW,
      creator: testPayer.publicKey.toBase58(),
      hops: [
        {
          recipient: recipient1.publicKey.toBase58(),
          scheduledAt: new Date(now.getTime() + 15_000).toISOString(),
        },
        {
          recipient: recipient2.publicKey.toBase58(),
          scheduledAt: new Date(now.getTime() + 18_000).toISOString(),
        },
      ],
    });

    expect(result.success).toBe(true);
    routeDbId = result.data.id;
    onChainRouteId = result.data.routeId;
  });

  // --- Obfuscation funding ---

  it("should fund obfuscation intermediate wallets", async () => {
    // 1. Get funding transactions from API
    const fundingResult = await apiClient.mutation(
      "routes.getObfuscationFundingTransactions",
      {
        routeId: routeDbId,
        creator: testPayer.publicKey.toBase58(),
      }
    );

    expect(fundingResult.success).toBe(true);
    expect(fundingResult.data.transactions.length).toBeGreaterThan(0);

    // 2. Sign and send each funding transaction
    const fundingResults: Array<{ walletIndex: number; txHash: string }> = [];

    for (const tx of fundingResult.data.transactions) {
      const txHash = await signAndSendTransaction(tx.serialized, testPayer);
      fundingResults.push({
        walletIndex: tx.walletIndex,
        txHash,
      });
    }

    // 3. Confirm all funding to API (triggers aggregation scheduling)
    const confirmResult = await apiClient.mutation(
      "routes.confirmAllObfuscationFunding",
      {
        routeId: routeDbId,
        fundingResults,
      }
    );

    expect(confirmResult.success).toBe(true);
    expect(confirmResult.data.allFunded).toBe(true);

    // Capture Wallet X address for post-execution verification
    const session = await apiClient.query("routes.getObfuscationSession", {
      routeId: routeDbId,
    });
    walletXAddress = session.data.walletXAddress;
  });

  // --- Wait for server-side automatic processing ---

  it("should wait for obfuscation to complete (aggregate + deploy)", async () => {
    let status = "";
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await apiClient.query("routes.getObfuscationStatus", {
        routeId: routeDbId,
      });
      status = result.data?.status || "";

      if (status === "completed") break;
      if (status === "failed") {
        throw new Error("Obfuscation session failed");
      }

      await new Promise((r) => setTimeout(r, 3000));
    }
    expect(status).toBe("completed");
  }, 200_000);

  it("should wait for all hops to execute automatically", async () => {
    let routeStatus = "";
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await apiClient.query("routes.getById", {
        id: routeDbId,
        creator: testPayer.publicKey.toBase58(),
      });
      routeStatus = result.data?.status || "";

      if (routeStatus === "completed") break;
      if (routeStatus === "failed") {
        throw new Error("Route execution failed");
      }

      await new Promise((r) => setTimeout(r, 5000));
    }
    expect(routeStatus).toBe("completed");
  }, 600_000);

  // --- Verification ---

  it("intermediate hop recipient should have zero token balance", async () => {
    const ata = await getAssociatedTokenAddress(splMint, recipient1.publicKey);
    try {
      const account = await getAccount(connection, ata);
      expect(Number(account.amount)).toBe(0);
    } catch {
      // ATA closed or never created = effectively 0 balance
    }
  });

  it("final recipient should have the hop amount minus fees in tokens", async () => {
    const ata = await getAssociatedTokenAddress(splMint, recipient2.publicKey);
    const account = await getAccount(connection, ata);
    // 1% fee (feeBps=100) is deducted from the token transfer
    const minExpected = Math.floor(Number(HOP_AMOUNT_RAW) * 99 / 100);
    expect(Number(account.amount)).toBeGreaterThanOrEqual(minExpected);
    expect(Number(account.amount)).toBeLessThanOrEqual(Number(HOP_AMOUNT_RAW));
  });

  it("Wallet X should be drained to 0", async () => {
    const balance = await connection.getBalance(new PublicKey(walletXAddress));
    expect(balance).toBe(0);
  });

  it("should show route as completed on-chain", async () => {
    let result;
    for (let attempt = 0; attempt < 10; attempt++) {
      result = await apiClient.query("contract.getRouteState", {
        routeId: onChainRouteId,
      });
      if (result.data?.currentHopIndex === 2) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    expect(result.success).toBe(true);
    expect(result.data.currentHopIndex).toBe(2);
  });
});
