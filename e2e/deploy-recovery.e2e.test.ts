import { beforeAll, describe, expect, it } from "vitest";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import pg from "pg";
import { connection, testPayer } from "./setup/test-context";
import { airdrop } from "./helpers/airdrop";
import { apiClient } from "./helpers/api-client";
import { authenticateWallet } from "./helpers/auth";
import { signAndSendTransaction } from "./helpers/tx-signer";

describe("Deploy Recovery E2E", () => {
  const HOP_AMOUNT_SOL = 0.05;
  const HOP_SPACING_MS = 15_000;
  const HOP_AMOUNT_LAMPORTS = String(
    Math.floor(HOP_AMOUNT_SOL * LAMPORTS_PER_SOL)
  );

  const recipients = [Keypair.generate(), Keypair.generate(), Keypair.generate()];

  let routeDbId: number;
  let onChainRouteId: number;
  let hops: Array<{ recipient: string; scheduledAt: number }>;

  async function disableObfuscationForRoute(routeId: number): Promise<void> {
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
    });
    await client.connect();
    try {
      await client.query(
        "UPDATE routes SET has_obfuscation = FALSE WHERE id = $1",
        [routeId]
      );
      await client.query(
        "UPDATE obfuscation_sessions SET status = $1 WHERE route_id = $2",
        ["completed", routeId]
      );
    } finally {
      await client.end();
    }
  }

  async function ensureSolTokenConfig(): Promise<void> {
    try {
      const existing = await apiClient.query("contract.getTokenConfigSOL", {
        creator: testPayer.publicKey.toBase58(),
      });
      if (existing.data) {
        return;
      }
    } catch {
      // Create below.
    }

    const initResult = await apiClient.mutation(
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

    try {
      await signAndSendTransaction(initResult.data.transaction, testPayer);
    } catch {
      // Account may already exist on-chain from another retry or suite.
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const check = await apiClient.query("contract.getTokenConfigSOL", {
          creator: testPayer.publicKey.toBase58(),
        });
        if (check.data) {
          return;
        }
      } catch {
        // Not readable yet.
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    throw new Error("SOL token config did not become readable in time");
  }

  beforeAll(async () => {
    const balance = await connection.getBalance(testPayer.publicKey);
    if (balance < 10 * LAMPORTS_PER_SOL) {
      await airdrop(connection, testPayer.publicKey, 100);
    }

    await authenticateWallet(testPayer);
    await ensureSolTokenConfig();
  });

  it("recovers from a partially initialized SOL route by retrying only the missing hops", async () => {
    const now = Date.now();
    hops = recipients.map((recipient, index) => ({
      recipient: recipient.publicKey.toBase58(),
      scheduledAt: now + (index + 1) * HOP_SPACING_MS,
    }));

    const createResult = await apiClient.mutation("routes.create", {
      name: `E2E Deploy Recovery ${now}`,
      tokenType: "SOL",
      tokenDecimals: 9,
      hopAmountTokens: String(HOP_AMOUNT_SOL),
      hopAmountRaw: HOP_AMOUNT_LAMPORTS,
      creator: testPayer.publicKey.toBase58(),
      hops: hops.map((hop) => ({
        recipient: hop.recipient,
        scheduledAt: new Date(hop.scheduledAt).toISOString(),
      })),
    });

    routeDbId = createResult.data.id;
    onChainRouteId = createResult.data.routeId;

    await disableObfuscationForRoute(routeDbId);

    const initResult = await apiClient.mutation("contract.initializeRouteSOL", {
      routeId: onChainRouteId,
      hops,
      hopAmount: HOP_AMOUNT_LAMPORTS,
      splMint: "So11111111111111111111111111111111111111112",
    });

    const initSignature = await signAndSendTransaction(
      initResult.data.transaction,
      testPayer,
      initResult.data.additionalSignerSecret
    );
    if (initResult.data.setupTransaction) {
      await signAndSendTransaction(initResult.data.setupTransaction, testPayer);
    }

    const routeStatusAfterInit = await apiClient.query("contract.routeHasHops", {
      routeId: onChainRouteId,
    });
    expect(routeStatusAfterInit.data.isDeployed).toBe(false);
    expect(routeStatusAfterInit.data.hasHops).toBe(false);

    const addHopsResult = await apiClient.mutation("contract.addHopsBatched", {
      routeId: onChainRouteId,
      hops,
    });

    for (const tx of addHopsResult.data.transactions) {
      await signAndSendTransaction(tx.transaction, testPayer);
    }

    await apiClient.mutation("routes.markDeployed", {
      id: routeDbId,
      deploymentTxHash: initSignature,
    });

    const routeAfterRecovery = await apiClient.query("routes.getById", {
      id: routeDbId,
      creator: testPayer.publicKey.toBase58(),
    });
    expect(routeAfterRecovery.data?.deploymentStatus).toBe("deployed");

    let routeStatusAfterRecovery = await apiClient.query("contract.routeHasHops", {
      routeId: onChainRouteId,
    });
    for (let attempt = 0; attempt < 10; attempt++) {
      if (routeStatusAfterRecovery.data.isDeployed && routeStatusAfterRecovery.data.hasHops) {
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
      routeStatusAfterRecovery = await apiClient.query("contract.routeHasHops", {
        routeId: onChainRouteId,
      });
    }
    expect(routeStatusAfterRecovery.data.isDeployed).toBe(true);
    expect(routeStatusAfterRecovery.data.hasHops).toBe(true);

    let finalRouteState = await apiClient.query("contract.getRouteState", {
      routeId: onChainRouteId,
    });
    for (let attempt = 0; attempt < 10; attempt++) {
      if (finalRouteState.data?.hopsCount === 3) {
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
      finalRouteState = await apiClient.query("contract.getRouteState", {
        routeId: onChainRouteId,
      });
    }
    expect(finalRouteState.data.hopsCount).toBe(3);
    expect(finalRouteState.data.currentHopIndex).toBe(0);
  }, 180_000);

  it("eventually reaches completed status after recovery", async () => {
    expect(routeDbId).toBeDefined();
    expect(onChainRouteId).toBeDefined();

    let routeStatus = "";
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await apiClient.query("routes.getById", {
        id: routeDbId,
        creator: testPayer.publicKey.toBase58(),
      });
      routeStatus = result.data?.status || "";

      if (routeStatus === "completed") break;
      if (routeStatus === "failed") {
        throw new Error("Recovered route execution failed");
      }

      await new Promise((r) => setTimeout(r, 5000));
    }

    expect(routeStatus).toBe("completed");

    let finalRouteState;
    for (let attempt = 0; attempt < 10; attempt++) {
      finalRouteState = await apiClient.query("contract.getRouteState", {
        routeId: onChainRouteId,
      });
      if (finalRouteState.data?.currentHopIndex === 3) break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    expect(finalRouteState.success).toBe(true);
    expect(finalRouteState.data.currentHopIndex).toBe(3);
  }, 600_000);
});
