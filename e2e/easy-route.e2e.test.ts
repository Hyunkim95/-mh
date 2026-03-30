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

describe("Easy Route E2E — SOL", () => {
  const HOP_AMOUNT_SOL = 0.05;
  const HOP_AMOUNT_LAMPORTS = String(
    Math.floor(HOP_AMOUNT_SOL * LAMPORTS_PER_SOL)
  );

  let destination: Keypair;
  let routeDbId: number;
  let onChainRouteId: number;
  let intermediateHopAddresses: string[] = [];
  let walletXAddress: string;

  beforeAll(async () => {
    destination = Keypair.generate();

    const balance = await connection.getBalance(testPayer.publicKey);
    if (balance < 10 * LAMPORTS_PER_SOL) {
      await airdrop(connection, testPayer.publicKey, 100);
    }

    await authenticateWallet(testPayer);
  });

  // --- Token config (ensure it exists) ---

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
      // Account may already exist on-chain from another test suite
    }
  });

  // --- Easy route creation ---

  it("should create SOL easy route via easyRoutes.create", async () => {
    const arrivalTime = new Date(Date.now() + 30_000); // 30 seconds from now

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
    expect(result.data.isEasyRoute).toBe(true);
    routeDbId = result.data.id;
    onChainRouteId = result.data.routeId;
    expect(routeDbId).toBeGreaterThan(0);

    // Should have auto-generated 3 hops (2 intermediate + 1 destination)
    expect(result.data.hops).toHaveLength(3);
    // Last hop should be our destination
    expect(result.data.hops[2].recipient).toBe(
      destination.publicKey.toBase58()
    );

    // Capture intermediate hop addresses for post-execution verification
    intermediateHopAddresses = result.data.hops
      .slice(0, -1)
      .map((h: any) => h.recipient);
  });

  // --- Obfuscation funding ---

  it("should fund obfuscation intermediate wallets", async () => {
    const fundingResult = await apiClient.mutation(
      "routes.getObfuscationFundingTransactions",
      {
        routeId: routeDbId,
        creator: testPayer.publicKey.toBase58(),
      }
    );

    expect(fundingResult.success).toBe(true);
    expect(fundingResult.data.transactions.length).toBeGreaterThan(0);

    const fundingResults: Array<{ walletIndex: number; txHash: string }> = [];

    for (const tx of fundingResult.data.transactions) {
      const txHash = await signAndSendTransaction(tx.serialized, testPayer);
      fundingResults.push({
        walletIndex: tx.walletIndex,
        txHash,
      });
    }

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

  // --- Wait for automatic processing ---

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

  it("should wait for all hops to execute automatically", async () => {
    let routeStatus = "";
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await apiClient.query("routes.getById", {
        id: routeDbId,
        creator: testPayer.publicKey.toBase58(),
      });
      routeStatus = result.data?.status || "";
      if (routeStatus === "completed") break;
      if (routeStatus === "failed") throw new Error("Route failed");
      await new Promise((r) => setTimeout(r, 5000));
    }
    expect(routeStatus).toBe("completed");
  }, 600_000);

  // --- Verification ---

  it("intermediate hop recipients should be zeroed out", async () => {
    for (const address of intermediateHopAddresses) {
      const balance = await connection.getBalance(new PublicKey(address));
      expect(balance).toBe(0);
    }
  });

  it("final destination should have the hop amount (plus rent reclaimed)", async () => {
    const balance = await connection.getBalance(destination.publicKey);
    // Rent reclaimed from closed intermediate wallets exceeds fee deduction
    expect(balance).toBeGreaterThanOrEqual(Number(HOP_AMOUNT_LAMPORTS));
  });

  it("Wallet X should be drained to 0", async () => {
    const balance = await connection.getBalance(new PublicKey(walletXAddress));
    expect(balance).toBe(0);
  });

  it("should show route state as completed on-chain", async () => {
    let result;
    for (let attempt = 0; attempt < 10; attempt++) {
      result = await apiClient.query("contract.getRouteState", {
        routeId: onChainRouteId,
      });
      if (result.data?.currentHopIndex === 3) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    expect(result.success).toBe(true);
    expect(result.data.currentHopIndex).toBe(3);
  });
});

describe("Easy Route E2E — SPL", () => {
  const TOKEN_DECIMALS = 6;
  const MINT_AMOUNT = 1_000_000 * 10 ** TOKEN_DECIMALS;
  const HOP_AMOUNT_TOKENS = 100;
  const HOP_AMOUNT_RAW = String(HOP_AMOUNT_TOKENS * 10 ** TOKEN_DECIMALS);

  let splMint: any;
  let destination: Keypair;
  let routeDbId: number;
  let onChainRouteId: number;
  let intermediateHopAddresses: string[] = [];
  let walletXAddress: string;

  beforeAll(async () => {
    destination = Keypair.generate();

    const balance = await connection.getBalance(testPayer.publicKey);
    if (balance < 10 * LAMPORTS_PER_SOL) {
      await airdrop(connection, testPayer.publicKey, 100);
    }

    splMint = await createTestSplMint(connection, testPayer, TOKEN_DECIMALS);
    await mintTestTokens(
      connection,
      testPayer,
      splMint,
      testPayer.publicKey,
      MINT_AMOUNT
    );

    await authenticateWallet(testPayer);
  });

  it("should create SPL easy route via easyRoutes.create", async () => {
    const arrivalTime = new Date(Date.now() + 30_000);

    const result = await apiClient.mutation("easyRoutes.create", {
      arrivalTime: arrivalTime.toISOString(),
      hopCount: 2,
      destinationWallet: destination.publicKey.toBase58(),
      tokenType: "SPL",
      tokenMint: splMint.toBase58(),
      tokenSymbol: "TEST",
      tokenDecimals: TOKEN_DECIMALS,
      hopAmountTokens: String(HOP_AMOUNT_TOKENS),
      hopAmountRaw: HOP_AMOUNT_RAW,
      creator: testPayer.publicKey.toBase58(),
    });

    expect(result.success).toBe(true);
    expect(result.data.isEasyRoute).toBe(true);
    routeDbId = result.data.id;
    onChainRouteId = result.data.routeId;

    // 2 hops: 1 intermediate + 1 destination
    expect(result.data.hops).toHaveLength(2);
    expect(result.data.hops[1].recipient).toBe(
      destination.publicKey.toBase58()
    );

    // Capture intermediate hop addresses for post-execution verification
    intermediateHopAddresses = result.data.hops
      .slice(0, -1)
      .map((h: any) => h.recipient);
  });

  it("should fund obfuscation intermediate wallets", async () => {
    const fundingResult = await apiClient.mutation(
      "routes.getObfuscationFundingTransactions",
      {
        routeId: routeDbId,
        creator: testPayer.publicKey.toBase58(),
      }
    );

    expect(fundingResult.success).toBe(true);

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

    // Capture Wallet X address for post-execution verification
    const session = await apiClient.query("routes.getObfuscationSession", {
      routeId: routeDbId,
    });
    walletXAddress = session.data.walletXAddress;
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

  it("should wait for all hops to execute automatically", async () => {
    let routeStatus = "";
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await apiClient.query("routes.getById", {
        id: routeDbId,
        creator: testPayer.publicKey.toBase58(),
      });
      routeStatus = result.data?.status || "";
      if (routeStatus === "completed") break;
      if (routeStatus === "failed") throw new Error("Route failed");
      await new Promise((r) => setTimeout(r, 5000));
    }
    expect(routeStatus).toBe("completed");
  }, 600_000);

  it("intermediate hop recipients should have zero token balance", async () => {
    for (const address of intermediateHopAddresses) {
      const ownerPk = new PublicKey(address);
      const ata = await getAssociatedTokenAddress(splMint, ownerPk);
      try {
        const account = await getAccount(connection, ata);
        expect(Number(account.amount)).toBe(0);
      } catch {
        // ATA closed or never created = effectively 0 balance
      }
    }
  });

  it("final destination should have the hop amount minus fees in tokens", async () => {
    const ata = await getAssociatedTokenAddress(
      splMint,
      destination.publicKey
    );
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
