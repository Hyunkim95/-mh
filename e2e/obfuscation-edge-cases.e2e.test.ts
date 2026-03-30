import { describe, it, expect, beforeAll } from "vitest";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { connection, testPayer } from "./setup/test-context";
import { airdrop } from "./helpers/airdrop";
import { apiClient } from "./helpers/api-client";
import { authenticateWallet } from "./helpers/auth";
import { signAndSendTransaction } from "./helpers/tx-signer";

/**
 * E2E tests for obfuscation edge cases.
 *
 * These exercise production bug fixes at the e2e level — real solana-test-validator,
 * real PostgreSQL, real API. Each test targets a specific bug from the round-2 fix list.
 */

// ─── Shared helpers ───────────────────────────────────────────────

const HOP_AMOUNT_SOL = 0.05;
const HOP_AMOUNT_LAMPORTS = String(
  Math.floor(HOP_AMOUNT_SOL * LAMPORTS_PER_SOL)
);

/** Poll obfuscation status until completed or failed (up to ~3 min).
 *  The e2e docker-compose sets OBFUSCATION_RETRY_COOLDOWN_MS=10000 (10s),
 *  so retries happen quickly. We still poll long enough for safety.
 */
async function waitForObfuscationComplete(routeDbId: number): Promise<void> {
  let status = "";
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = await apiClient.query("routes.getObfuscationStatus", {
      routeId: routeDbId,
    });
    status = result.data?.status || "";
    if (status === "completed") return;
    if (status === "failed") {
      // Fetch session details for error info
      const session = await apiClient.query("routes.getObfuscationSession", {
        routeId: routeDbId,
      });
      const lastError = session.data?.lastError || "unknown";
      throw new Error(`Obfuscation session failed: ${lastError}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  // On timeout, fetch session details for diagnostics
  try {
    const session = await apiClient.query("routes.getObfuscationSession", {
      routeId: routeDbId,
    });
    const lastError = session.data?.lastError || "none";
    const failureCount = session.data?.failureCount || 0;
    throw new Error(
      `Obfuscation did not complete in time (status: ${status}, failures: ${failureCount}, lastError: ${lastError})`
    );
  } catch (e: any) {
    if (e.message.includes("did not complete")) throw e;
    throw new Error(`Obfuscation did not complete in time (last status: ${status})`);
  }
}

/** Poll route status until completed or failed (up to ~5 min). */
async function waitForRouteComplete(routeDbId: number): Promise<void> {
  let routeStatus = "";
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = await apiClient.query("routes.getById", {
      id: routeDbId,
      creator: testPayer.publicKey.toBase58(),
    });
    routeStatus = result.data?.status || "";
    if (routeStatus === "completed") return;
    if (routeStatus === "failed") {
      throw new Error(`Route execution failed (route ${routeDbId})`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Route did not complete in time (last status: ${routeStatus})`);
}

/** Fund an obfuscation session: get funding txs, sign them, confirm. Returns intermediate wallet addresses and Wallet X address. */
async function fundObfuscation(routeDbId: number): Promise<{ intermediateAddresses: string[]; walletXAddress: string }> {
  const fundingResult = await apiClient.mutation(
    "routes.getObfuscationFundingTransactions",
    {
      routeId: routeDbId,
      creator: testPayer.publicKey.toBase58(),
    }
  );

  expect(fundingResult.success).toBe(true);
  expect(fundingResult.data.transactions.length).toBeGreaterThan(0);

  const intermediateAddresses = fundingResult.data.transactions.map(
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

  // Capture Wallet X address
  const session = await apiClient.query("routes.getObfuscationSession", {
    routeId: routeDbId,
  });
  const walletXAddress = session.data.walletXAddress;

  return { intermediateAddresses, walletXAddress };
}

/** Ensure SOL token config exists on-chain and readable by API. */
async function ensureTokenConfig(): Promise<void> {
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

  // Wait until the API can actually read the on-chain config
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const check = await apiClient.query("contract.getTokenConfigSOL", {
        creator: testPayer.publicKey.toBase58(),
      });
      if (check.data) return;
    } catch {
      // Not readable yet
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ─── Test 1: Multi-hop route completes with all hops on-chain (Bug #4) ───

// Use a larger hop amount for the 5-hop test so Wallet X has enough SOL
// for deployment costs that scale with hop count (executor funding, account rent,
// addHops batches). With 5 hops, deployment cost is ~3x higher than a 2-hop route.
const MULTIHOP_AMOUNT_SOL = 0.15;
const MULTIHOP_AMOUNT_LAMPORTS = String(
  Math.floor(MULTIHOP_AMOUNT_SOL * LAMPORTS_PER_SOL)
);

describe("Bug #4: Multi-hop route completes with all hops on-chain", () => {
  const recipients: Keypair[] = [];
  let routeDbId: number;
  let onChainRouteId: number;
  let walletXAddress: string;

  beforeAll(async () => {
    for (let i = 0; i < 5; i++) {
      recipients.push(Keypair.generate());
    }

    const balance = await connection.getBalance(testPayer.publicKey);
    if (balance < 10 * LAMPORTS_PER_SOL) {
      await airdrop(connection, testPayer.publicKey, 100);
    }

    await authenticateWallet(testPayer);
    await ensureTokenConfig();
  });

  it("should create a 5-hop route", async () => {
    const now = new Date();
    const result = await apiClient.mutation("routes.create", {
      name: "E2E Multi-hop Edge Case (5 hops)",
      tokenType: "SOL",
      tokenDecimals: 9,
      hopAmountTokens: String(MULTIHOP_AMOUNT_SOL),
      hopAmountRaw: MULTIHOP_AMOUNT_LAMPORTS,
      creator: testPayer.publicKey.toBase58(),
      hops: recipients.map((r, i) => ({
        recipient: r.publicKey.toBase58(),
        scheduledAt: new Date(now.getTime() + 15_000 + i * 3_000).toISOString(),
      })),
    });

    expect(result.success).toBe(true);
    routeDbId = result.data.id;
    onChainRouteId = result.data.routeId;
    expect(routeDbId).toBeGreaterThan(0);
  });

  it("should fund obfuscation", async () => {
    const result = await fundObfuscation(routeDbId);
    walletXAddress = result.walletXAddress;
  });

  it("should wait for obfuscation to complete", async () => {
    await waitForObfuscationComplete(routeDbId);
  }, 200_000);

  it("should wait for all 5 hops to execute", async () => {
    await waitForRouteComplete(routeDbId);
  }, 600_000);

  it("should have all 5 hops registered on-chain (currentHopIndex === 5)", async () => {
    let result: any;
    for (let attempt = 0; attempt < 10; attempt++) {
      result = await apiClient.query("contract.getRouteState", {
        routeId: onChainRouteId,
      });
      if (result.data?.currentHopIndex === 5) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    expect(result.success).toBe(true);
    expect(result.data.currentHopIndex).toBe(5);
  });

  it("intermediate hop recipients should be zeroed out", async () => {
    for (let i = 0; i < recipients.length - 1; i++) {
      const balance = await connection.getBalance(recipients[i].publicKey);
      expect(balance).toBe(0);
    }
  });

  it("final recipient should have the hop amount (plus rent reclaimed)", async () => {
    const lastRecipient = recipients[recipients.length - 1];
    const balance = await connection.getBalance(lastRecipient.publicKey);
    // Rent reclaimed from closed intermediate wallets exceeds fee deduction
    expect(balance).toBeGreaterThanOrEqual(Number(MULTIHOP_AMOUNT_LAMPORTS));
  });

  it("Wallet X should be drained to 0", async () => {
    const balance = await connection.getBalance(new PublicKey(walletXAddress));
    expect(balance).toBe(0);
  });
});

// ─── Test 2: Wallet X balance is zero after obfuscation (Bug #3) ───

describe("Bug #3: Wallet X balance is zero after obfuscation completes", () => {
  let routeDbId: number;
  let intermediateAddresses: string[] = [];
  let walletXAddress: string;

  beforeAll(async () => {
    const balance = await connection.getBalance(testPayer.publicKey);
    if (balance < 10 * LAMPORTS_PER_SOL) {
      await airdrop(connection, testPayer.publicKey, 100);
    }

    await authenticateWallet(testPayer);
    await ensureTokenConfig();
  });

  it("should create route", async () => {
    const now = new Date();
    const destination = Keypair.generate();

    const result = await apiClient.mutation("routes.create", {
      name: "E2E Wallet X Cleanup Edge Case",
      tokenType: "SOL",
      tokenDecimals: 9,
      hopAmountTokens: String(HOP_AMOUNT_SOL),
      hopAmountRaw: HOP_AMOUNT_LAMPORTS,
      creator: testPayer.publicKey.toBase58(),
      hops: [
        {
          recipient: destination.publicKey.toBase58(),
          scheduledAt: new Date(now.getTime() + 15_000).toISOString(),
        },
      ],
    });

    expect(result.success).toBe(true);
    routeDbId = result.data.id;
  });

  it("should fund obfuscation and capture wallet addresses", async () => {
    const result = await fundObfuscation(routeDbId);
    intermediateAddresses = result.intermediateAddresses;
    walletXAddress = result.walletXAddress;
    expect(walletXAddress).toBeTruthy();
  });

  it("should wait for obfuscation to complete", async () => {
    await waitForObfuscationComplete(routeDbId);
  }, 200_000);

  it("intermediate wallets should be drained to 0", async () => {
    // Wait a few seconds for cleanup transactions to finalize
    await new Promise((r) => setTimeout(r, 5000));

    for (const address of intermediateAddresses) {
      const balance = await connection.getBalance(new PublicKey(address));
      expect(balance).toBe(0);
    }
  });

  it("Wallet X should be drained to 0 (Bug #3 fix)", async () => {
    // Before Bug #3 fix, Wallet X cleanup could return null when balance
    // was below tx fee, and the scheduler would mark it as success,
    // leaving dust locked forever.
    const balance = await connection.getBalance(new PublicKey(walletXAddress));
    expect(balance).toBe(0);
  });
});

// ─── Test 3: Concurrent routes both complete (Bugs #1 & #8) ───

describe("Bugs #1 & #8: Concurrent routes both complete without double-spend or starvation", () => {
  const routeA = {
    recipients: [Keypair.generate(), Keypair.generate()],
    dbId: 0,
    walletXAddress: "",
  };
  const routeB = {
    recipients: [Keypair.generate(), Keypair.generate()],
    dbId: 0,
    walletXAddress: "",
  };

  beforeAll(async () => {
    const balance = await connection.getBalance(testPayer.publicKey);
    if (balance < 20 * LAMPORTS_PER_SOL) {
      await airdrop(connection, testPayer.publicKey, 100);
    }

    await authenticateWallet(testPayer);
    await ensureTokenConfig();
  });

  it("should create two independent routes in parallel", async () => {
    const now = new Date();

    const [resultA, resultB] = await Promise.all([
      apiClient.mutation("routes.create", {
        name: "E2E Concurrent Route A",
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: String(HOP_AMOUNT_SOL),
        hopAmountRaw: HOP_AMOUNT_LAMPORTS,
        creator: testPayer.publicKey.toBase58(),
        hops: routeA.recipients.map((r, i) => ({
          recipient: r.publicKey.toBase58(),
          scheduledAt: new Date(now.getTime() + 15_000 + i * 3_000).toISOString(),
        })),
      }),
      apiClient.mutation("routes.create", {
        name: "E2E Concurrent Route B",
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: String(HOP_AMOUNT_SOL),
        hopAmountRaw: HOP_AMOUNT_LAMPORTS,
        creator: testPayer.publicKey.toBase58(),
        hops: routeB.recipients.map((r, i) => ({
          recipient: r.publicKey.toBase58(),
          scheduledAt: new Date(now.getTime() + 15_000 + i * 3_000).toISOString(),
        })),
      }),
    ]);

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);
    routeA.dbId = resultA.data.id;
    routeB.dbId = resultB.data.id;
  });

  it("should fund both routes", async () => {
    // Fund sequentially (same payer signs both sets of txs)
    const resultA = await fundObfuscation(routeA.dbId);
    routeA.walletXAddress = resultA.walletXAddress;
    const resultB = await fundObfuscation(routeB.dbId);
    routeB.walletXAddress = resultB.walletXAddress;
  });

  it("should wait for both obfuscation sessions to complete", async () => {
    await Promise.all([
      waitForObfuscationComplete(routeA.dbId),
      waitForObfuscationComplete(routeB.dbId),
    ]);
  }, 200_000);

  it("should wait for both routes to execute all hops", async () => {
    await Promise.all([
      waitForRouteComplete(routeA.dbId),
      waitForRouteComplete(routeB.dbId),
    ]);
  }, 600_000);

  it("intermediate hop recipients should be zeroed out for both routes", async () => {
    // Route A: first recipient is intermediate
    const balanceA0 = await connection.getBalance(routeA.recipients[0].publicKey);
    expect(balanceA0).toBe(0);

    // Route B: first recipient is intermediate
    const balanceB0 = await connection.getBalance(routeB.recipients[0].publicKey);
    expect(balanceB0).toBe(0);
  });

  it("final recipients should have the hop amount for both routes (plus rent reclaimed)", async () => {
    const lastA = routeA.recipients[routeA.recipients.length - 1];
    const lastB = routeB.recipients[routeB.recipients.length - 1];

    const balanceA = await connection.getBalance(lastA.publicKey);
    const balanceB = await connection.getBalance(lastB.publicKey);
    // Rent reclaimed from closed intermediate wallets exceeds fee deduction
    expect(balanceA).toBeGreaterThanOrEqual(Number(HOP_AMOUNT_LAMPORTS));
    expect(balanceB).toBeGreaterThanOrEqual(Number(HOP_AMOUNT_LAMPORTS));
  });

  it("Wallet X should be drained to 0 for both routes", async () => {
    const balanceA = await connection.getBalance(new PublicKey(routeA.walletXAddress));
    const balanceB = await connection.getBalance(new PublicKey(routeB.walletXAddress));
    expect(balanceA).toBe(0);
    expect(balanceB).toBe(0);
  });
});

// ─── Test 4: Session recovery after re-creation (Bug #5) ───

describe("Bug #5: Session recovery after re-creation", () => {
  let routeDbId: number;
  let walletXAddress: string;
  const destination = Keypair.generate();

  beforeAll(async () => {
    const balance = await connection.getBalance(testPayer.publicKey);
    if (balance < 10 * LAMPORTS_PER_SOL) {
      await airdrop(connection, testPayer.publicKey, 100);
    }

    await authenticateWallet(testPayer);
    await ensureTokenConfig();
  });

  it("should create a route (unfunded)", async () => {
    const now = new Date();

    const result = await apiClient.mutation("routes.create", {
      name: "E2E Session Recovery Edge Case",
      tokenType: "SOL",
      tokenDecimals: 9,
      hopAmountTokens: String(HOP_AMOUNT_SOL),
      hopAmountRaw: HOP_AMOUNT_LAMPORTS,
      creator: testPayer.publicKey.toBase58(),
      hops: [
        {
          recipient: destination.publicKey.toBase58(),
          scheduledAt: new Date(now.getTime() + 60_000).toISOString(),
        },
      ],
    });

    expect(result.success).toBe(true);
    routeDbId = result.data.id;
  });

  it("should have a pending session initially", async () => {
    const session = await apiClient.query("routes.getObfuscationSession", {
      routeId: routeDbId,
    });

    expect(session.success).toBe(true);
    expect(["pending", "funding"]).toContain(session.data.status);
  });

  it("should return a usable session when re-requesting (not stuck in failed)", async () => {
    // Wait a bit, then re-query the session — it should still be usable
    await new Promise((r) => setTimeout(r, 5000));

    const session = await apiClient.query("routes.getObfuscationSession", {
      routeId: routeDbId,
    });

    expect(session.success).toBe(true);
    // Before Bug #5 fix, a failed session would be returned as-is with no recovery path.
    // After fix, the session should be in a usable state (pending or funding).
    expect(session.data.status).not.toBe("failed");
  });

  it("should complete after funding", async () => {
    const result = await fundObfuscation(routeDbId);
    walletXAddress = result.walletXAddress;
    await waitForObfuscationComplete(routeDbId);
  }, 200_000);

  it("should complete route execution", async () => {
    await waitForRouteComplete(routeDbId);
  }, 600_000);

  it("final recipient should have the hop amount (plus rent reclaimed)", async () => {
    const balance = await connection.getBalance(destination.publicKey);
    // Rent reclaimed from closed intermediate wallets exceeds fee deduction
    expect(balance).toBeGreaterThanOrEqual(Number(HOP_AMOUNT_LAMPORTS));
  });

  it("Wallet X should be drained to 0", async () => {
    const balance = await connection.getBalance(new PublicKey(walletXAddress));
    expect(balance).toBe(0);
  });
});

// ─── Test 5: Fee estimation is within bounds ───

describe("Fee estimation is within bounds", () => {
  let routeDbId: number;
  let walletXAddress: string;
  let estimatedFeesLamports: string;
  let actualFeesLamports: string;

  beforeAll(async () => {
    const balance = await connection.getBalance(testPayer.publicKey);
    if (balance < 10 * LAMPORTS_PER_SOL) {
      await airdrop(connection, testPayer.publicKey, 100);
    }

    await authenticateWallet(testPayer);
    await ensureTokenConfig();
  });

  it("should create route and capture estimated fees", async () => {
    const now = new Date();
    const destination = Keypair.generate();

    const result = await apiClient.mutation("routes.create", {
      name: "E2E Fee Estimation Edge Case",
      tokenType: "SOL",
      tokenDecimals: 9,
      hopAmountTokens: String(HOP_AMOUNT_SOL),
      hopAmountRaw: HOP_AMOUNT_LAMPORTS,
      creator: testPayer.publicKey.toBase58(),
      hops: [
        {
          recipient: destination.publicKey.toBase58(),
          scheduledAt: new Date(now.getTime() + 15_000).toISOString(),
        },
      ],
    });

    expect(result.success).toBe(true);
    routeDbId = result.data.id;

    // Get the session's estimated fees
    const session = await apiClient.query("routes.getObfuscationSession", {
      routeId: routeDbId,
    });
    expect(session.success).toBe(true);
    estimatedFeesLamports = session.data.estimatedFeesLamports;
    expect(estimatedFeesLamports).toBeTruthy();
  });

  it("should fund and wait for completion", async () => {
    const result = await fundObfuscation(routeDbId);
    walletXAddress = result.walletXAddress;
    await waitForObfuscationComplete(routeDbId);
  }, 200_000);

  it("should wait for route execution", async () => {
    await waitForRouteComplete(routeDbId);
  }, 600_000);

  it("actual fees should be within estimated bounds", async () => {
    // Re-fetch session to get actualFeesLamports (set on completion)
    const session = await apiClient.query("routes.getObfuscationSession", {
      routeId: routeDbId,
    });
    expect(session.success).toBe(true);
    actualFeesLamports = session.data.actualFeesLamports;

    const actual = Number(actualFeesLamports);
    const estimated = Number(estimatedFeesLamports);

    // Actual fees should be tracked (> 0)
    expect(actual).toBeGreaterThan(0);

    // Actual fees should not exceed estimated (we don't overcharge)
    expect(actual).toBeLessThanOrEqual(estimated);
  });

  it("Wallet X should be drained to 0", async () => {
    const balance = await connection.getBalance(new PublicKey(walletXAddress));
    expect(balance).toBe(0);
  });
});
