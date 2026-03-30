import { describe, it, expect, beforeAll } from "vitest";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { connection, testPayer } from "./setup/test-context";
import { airdrop } from "./helpers/airdrop";
import { apiClient } from "./helpers/api-client";
import { authenticateWallet } from "./helpers/auth";
import { signAndSendTransaction } from "./helpers/tx-signer";

describe("SOL Route E2E — Full API Flow", () => {
  const HOP_AMOUNT_SOL = 0.05;
  const HOP_AMOUNT_LAMPORTS = String(
    Math.floor(HOP_AMOUNT_SOL * LAMPORTS_PER_SOL)
  );

  let recipient1: Keypair;
  let recipient2: Keypair;
  let recipient3: Keypair;
  let routeDbId: number;
  let onChainRouteId: number;
  let walletXAddress: string;

  beforeAll(async () => {
    recipient1 = Keypair.generate();
    recipient2 = Keypair.generate();
    recipient3 = Keypair.generate();

    // Ensure payer has enough SOL
    const balance = await connection.getBalance(testPayer.publicKey);
    if (balance < 10 * LAMPORTS_PER_SOL) {
      await airdrop(connection, testPayer.publicKey, 100);
    }
  });

  // --- Auth ---

  it("should authenticate with the API using wallet signature", async () => {
    const token = await authenticateWallet(testPayer);
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
  });

  it("should return authenticated user via auth.me", async () => {
    const user = await apiClient.query("auth.me");
    expect(user.publicKey).toBe(testPayer.publicKey.toBase58());
  });

  // --- Token config init (one-time on-chain setup) ---

  it("should initialize SOL token config via API", async () => {
    // Check if already exists
    try {
      const existing = await apiClient.query("contract.getTokenConfigSOL", {
        creator: testPayer.publicKey.toBase58(),
      });
      if (existing.data) return; // Already initialized
    } catch {
      // Not found, proceed to create
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
    expect(result.data.transaction).toBeTruthy();

    try {
      await signAndSendTransaction(result.data.transaction, testPayer);
    } catch {
      // Account may already exist on-chain from another test suite
    }
  });

  it("should verify token config exists on-chain via API", async () => {
    // The on-chain account may take a moment to be readable by the API
    let data = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await apiClient.query("contract.getTokenConfigSOL", {
        creator: testPayer.publicKey.toBase58(),
      });
      data = result.data;
      if (data) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log("Token Config:", data);
    expect(data).not.toBeNull();
  });

  // --- Route creation (DB + obfuscation session) ---

  it("should create SOL route via routes.create", async () => {
    const now = new Date();
    const result = await apiClient.mutation("routes.create", {
      name: "E2E SOL Route Test",
      tokenType: "SOL",
      tokenDecimals: 9,
      hopAmountTokens: String(HOP_AMOUNT_SOL),
      hopAmountRaw: HOP_AMOUNT_LAMPORTS,
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
        {
          recipient: recipient3.publicKey.toBase58(),
          scheduledAt: new Date(now.getTime() + 21_000).toISOString(),
        },
      ],
    });

    expect(result.success).toBe(true);
    routeDbId = result.data.id;
    onChainRouteId = result.data.routeId;
    expect(routeDbId).toBeGreaterThan(0);
  });

  // --- Obfuscation funding (client signs + sends funding txs) ---

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

  it("intermediate hop recipients should be zeroed out", async () => {
    const balance1 = await connection.getBalance(recipient1.publicKey);
    const balance2 = await connection.getBalance(recipient2.publicKey);
    expect(balance1).toBe(0);
    expect(balance2).toBe(0);
  });

  it("final recipient should have the hop amount (plus rent reclaimed)", async () => {
    const balance = await connection.getBalance(recipient3.publicKey);
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
