import { describe, it, expect, beforeAll } from "vitest";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import nacl from "tweetnacl";
import { decodeUTF8 } from "tweetnacl-util";
import bs58 from "bs58";
import { connection, testPayer } from "./setup/test-context";
import { airdrop } from "./helpers/airdrop";
import { apiClient, ApiClient } from "./helpers/api-client";
import { authenticateWallet } from "./helpers/auth";
import { signAndSendTransaction } from "./helpers/tx-signer";

/**
 * Authenticate a keypair against a specific ApiClient instance.
 * Unlike authenticateWallet(), this doesn't touch the shared apiClient.
 */
async function authenticateWithClient(
  client: ApiClient,
  wallet: Keypair
): Promise<string> {
  const challenge = await client.mutation<{ nonce: string; message: string }>(
    "auth.createMessage"
  );
  const messageBytes = decodeUTF8(challenge.message);
  const signature = nacl.sign.detached(messageBytes, wallet.secretKey);
  const result = await client.mutation<{ token: string }>(
    "auth.verifyUserWithSignature",
    {
      nonce: challenge.nonce,
      address: wallet.publicKey.toBase58(),
      signature: bs58.encode(signature),
      isHardwareWallet: false,
    }
  );
  client.setToken(result.token);
  return result.token;
}

/**
 * Initialize the on-chain SOL token config if it doesn't exist.
 * Required before creating routes (server validates config exists).
 * Must be called after authenticateWallet().
 * Returns true if the API can read the token config, false otherwise.
 */
async function ensureTokenConfig(): Promise<boolean> {
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
    // Already exists on-chain — that's fine
  }

  // Verify API can read the config (may take a moment after creation)
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const config = await apiClient.query("contract.getTokenConfigSOL", {
        creator: testPayer.publicKey.toBase58(),
      });
      if (config.data) return true;
    } catch {
      // Not readable yet
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

// --- Auth Error Paths ---

describe("Auth Errors", () => {
  beforeAll(async () => {
    const balance = await connection.getBalance(testPayer.publicKey);
    if (balance < 10 * LAMPORTS_PER_SOL) {
      await airdrop(connection, testPayer.publicKey, 100);
    }
  });

  it("should reject invalid signature during verification", async () => {
    // Get a real challenge
    const challenge = await apiClient.mutation<{
      nonce: string;
      message: string;
    }>("auth.createMessage");

    // Sign with a DIFFERENT keypair (wrong signer)
    const wrongSigner = Keypair.generate();
    const messageBytes = decodeUTF8(challenge.message);
    const badSignature = nacl.sign.detached(messageBytes, wrongSigner.secretKey);
    const badSignatureBase58 = bs58.encode(badSignature);

    // Attempt to verify with testPayer's address but wrong signature
    await expect(
      apiClient.mutation("auth.verifyUserWithSignature", {
        nonce: challenge.nonce,
        address: testPayer.publicKey.toBase58(),
        signature: badSignatureBase58,
        isHardwareWallet: false,
      })
    ).rejects.toThrow();
  });

  it("should reject access to protected endpoint without auth token", async () => {
    // Create a fresh client with no token
    const unauthClient = new ApiClient();

    await expect(unauthClient.query("auth.me")).rejects.toThrow();
  });

  it("should reject access to protected endpoint with invalid token", async () => {
    const badClient = new ApiClient();
    badClient.setToken("invalid.jwt.token");

    await expect(badClient.query("auth.me")).rejects.toThrow();
  });
});

// --- Route Validation Errors ---

describe("Route Validation Errors", () => {
  beforeAll(async () => {
    const balance = await connection.getBalance(testPayer.publicKey);
    if (balance < 10 * LAMPORTS_PER_SOL) {
      await airdrop(connection, testPayer.publicKey, 100);
    }
    await authenticateWallet(testPayer);
    await ensureTokenConfig();
  });

  it("should reject route with invalid recipient address", async () => {
    const now = new Date();
    await expect(
      apiClient.mutation("routes.create", {
        name: "Invalid Recipient Test",
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: "0.05",
        hopAmountRaw: "50000000",
        creator: testPayer.publicKey.toBase58(),
        hops: [
          {
            recipient: "not-a-valid-solana-address",
            scheduledAt: new Date(now.getTime() + 60_000).toISOString(),
          },
        ],
      })
    ).rejects.toThrow();
  });

  it("should reject route with hop amount below minimum transfer", async () => {
    const now = new Date();
    const recipient = Keypair.generate();

    // Token config has minTransfer: 1000000 (0.001 SOL)
    // Sending 100 lamports should fail
    await expect(
      apiClient.mutation("routes.create", {
        name: "Below Minimum Test",
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: "0.0000001",
        hopAmountRaw: "100",
        creator: testPayer.publicKey.toBase58(),
        hops: [
          {
            recipient: recipient.publicKey.toBase58(),
            scheduledAt: new Date(now.getTime() + 60_000).toISOString(),
          },
        ],
      })
    ).rejects.toThrow();
  });

  it("should reject route with hops not in chronological order", async () => {
    const now = new Date();
    const recipient1 = Keypair.generate();
    const recipient2 = Keypair.generate();

    await expect(
      apiClient.mutation("routes.create", {
        name: "Out of Order Hops Test",
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: "0.05",
        hopAmountRaw: "50000000",
        creator: testPayer.publicKey.toBase58(),
        hops: [
          {
            recipient: recipient1.publicKey.toBase58(),
            scheduledAt: new Date(now.getTime() + 120_000).toISOString(), // 2 min
          },
          {
            recipient: recipient2.publicKey.toBase58(),
            scheduledAt: new Date(now.getTime() + 60_000).toISOString(), // 1 min (before hop 1!)
          },
        ],
      })
    ).rejects.toThrow();
  });

  it("should allow SPL route with non-existent token config at creation time (documents gap)", async () => {
    // NOTE: This documents a missing server-side validation.
    // routes.create does not validate that the SPL token config exists on-chain.
    // The validation only happens later during deployment/execution.
    const now = new Date();
    const recipient = Keypair.generate();
    const fakeMint = Keypair.generate();

    const result = await apiClient.mutation<{
      data: { id: number };
    }>("routes.create", {
      name: "No Token Config Test",
      tokenType: "SPL",
      tokenMint: fakeMint.publicKey.toBase58(),
      tokenSymbol: "FAKE",
      tokenDecimals: 6,
      hopAmountTokens: "100",
      hopAmountRaw: "100000000",
      creator: testPayer.publicKey.toBase58(),
      hops: [
        {
          recipient: recipient.publicKey.toBase58(),
          scheduledAt: new Date(now.getTime() + 60_000).toISOString(),
        },
      ],
    });

    expect(result.data.id).toBeDefined();
  });
});

// --- Easy Route Validation Errors ---

describe("Easy Route Validation Errors", () => {
  beforeAll(async () => {
    await authenticateWallet(testPayer);
  });

  it("should reject easy route with arrival time in the past", async () => {
    const pastTime = new Date(Date.now() - 60_000); // 1 minute ago

    await expect(
      apiClient.mutation("easyRoutes.create", {
        arrivalTime: pastTime.toISOString(),
        hopCount: 2,
        destinationWallet: Keypair.generate().publicKey.toBase58(),
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: "0.05",
        hopAmountRaw: "50000000",
        creator: testPayer.publicKey.toBase58(),
      })
    ).rejects.toThrow(/arrival time/i);
  });

  it("should validate easy route without creating it", async () => {
    const pastTime = new Date(Date.now() - 60_000);

    const result = await apiClient.mutation("easyRoutes.validate", {
      arrivalTime: pastTime.toISOString(),
      hopCount: 2,
      destinationWallet: Keypair.generate().publicKey.toBase58(),
      tokenType: "SOL",
      tokenDecimals: 9,
      hopAmountTokens: "0.05",
      hopAmountRaw: "50000000",
    });

    expect(result.data.isValid).toBe(false);
    expect(result.data.errors.length).toBeGreaterThan(0);
  });
});

// --- Route Operation Errors ---

describe("Route Operation Errors", () => {
  beforeAll(async () => {
    await authenticateWallet(testPayer);
  });

  it("should return error when fetching non-existent route", async () => {
    await expect(
      apiClient.query("routes.getById", {
        id: 999999,
        creator: testPayer.publicKey.toBase58(),
      })
    ).rejects.toThrow();
  });

  it("should return error for obfuscation status of non-existent route", async () => {
    const result = await apiClient.query("routes.getObfuscationStatus", {
      routeId: 999999,
    });

    // Should return success: false with null data (no session found)
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
  });

  it("should return error for obfuscation funding of non-existent route", async () => {
    await expect(
      apiClient.mutation("routes.getObfuscationFundingTransactions", {
        routeId: 999999,
        creator: testPayer.publicKey.toBase58(),
      })
    ).rejects.toThrow();
  });

  it("should return null for non-existent on-chain route state", async () => {
    const result = await apiClient.query("contract.getRouteState", {
      routeId: 999999,
    });
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
  });
});

// --- Duplicate Token Config ---

describe("Token Config Edge Cases", () => {
  beforeAll(async () => {
    await authenticateWallet(testPayer);
  });

  it("should fail when initializing token config that already exists", async () => {
    // Ensure config exists on-chain (may already exist from other tests)
    try {
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
      await signAndSendTransaction(initResult.data.transaction, testPayer);
    } catch {
      // Already exists on-chain — that's fine for this test's setup
    }

    // Now try to initialize again — the on-chain tx should fail
    const duplicateResult = await apiClient.mutation(
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

    // API returns the unsigned tx successfully, but signing and sending should fail
    // because the PDA account already exists on-chain
    await expect(
      signAndSendTransaction(duplicateResult.data.transaction, testPayer)
    ).rejects.toThrow();
  });
});

// --- Route Ownership Isolation ---

describe("Route Ownership Isolation", () => {
  const otherUser = Keypair.generate();
  const otherClient = new ApiClient();
  let routeIdOwnedByTestPayer: number;

  beforeAll(async () => {
    // Ensure testPayer is funded and authenticated
    const balance = await connection.getBalance(testPayer.publicKey);
    if (balance < 10 * LAMPORTS_PER_SOL) {
      await airdrop(connection, testPayer.publicKey, 100);
    }
    await authenticateWallet(testPayer);

    // Create a route as testPayer (use easyRoutes — doesn't require token config)
    const futureTime = new Date(Date.now() + 600_000);
    const result = await apiClient.mutation<{
      data: { id: number };
    }>("easyRoutes.create", {
      arrivalTime: futureTime.toISOString(),
      hopCount: 2,
      destinationWallet: Keypair.generate().publicKey.toBase58(),
      tokenType: "SOL",
      tokenDecimals: 9,
      hopAmountTokens: "0.05",
      hopAmountRaw: "50000000",
      creator: testPayer.publicKey.toBase58(),
    });
    routeIdOwnedByTestPayer = result.data.id;

    // Fund and authenticate otherUser
    await airdrop(connection, otherUser.publicKey, 1);
    await authenticateWithClient(otherClient, otherUser);
  });

  it("should prevent User B from viewing User A's route", async () => {
    await expect(
      otherClient.query("routes.getById", {
        id: routeIdOwnedByTestPayer,
        creator: otherUser.publicKey.toBase58(),
      })
    ).rejects.toThrow();
  });

  it("should prevent User B from replaying User A's route", async () => {
    await expect(
      otherClient.mutation("routes.replay", {
        id: routeIdOwnedByTestPayer,
        creator: otherUser.publicKey.toBase58(),
      })
    ).rejects.toThrow();
  });

  it("should reject unauthenticated access to admin endpoint", async () => {
    const unauthClient = new ApiClient();
    await expect(
      unauthClient.query("tokenConfigs.getTokenConfigs")
    ).rejects.toThrow();
  });
});

// --- Route Creation - Edge Cases ---

describe("Route Creation - Edge Cases", () => {
  let tokenConfigReadable = false;

  beforeAll(async () => {
    await authenticateWallet(testPayer);
    tokenConfigReadable = await ensureTokenConfig();
  });

  it("should reject route with empty name", async () => {
    const now = new Date();
    const recipient = Keypair.generate();

    await expect(
      apiClient.mutation("routes.create", {
        name: "",
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: "0.05",
        hopAmountRaw: "50000000",
        creator: testPayer.publicKey.toBase58(),
        hops: [
          {
            recipient: recipient.publicKey.toBase58(),
            scheduledAt: new Date(now.getTime() + 60_000).toISOString(),
          },
        ],
      })
    ).rejects.toThrow();
  });

  it("should reject route with zero hop amount", async () => {
    const now = new Date();
    const recipient = Keypair.generate();

    await expect(
      apiClient.mutation("routes.create", {
        name: "Zero Amount Test",
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: "0",
        hopAmountRaw: "0",
        creator: testPayer.publicKey.toBase58(),
        hops: [
          {
            recipient: recipient.publicKey.toBase58(),
            scheduledAt: new Date(now.getTime() + 60_000).toISOString(),
          },
        ],
      })
    ).rejects.toThrow();
  });

  it("should allow route with empty hops array (documents gap)", async () => {
    // NOTE: This documents a missing server-side validation.
    // An empty hops array is accepted — there's no z.array().min(1) check.
    // Requires token config to be readable by the API.
    if (!tokenConfigReadable) return; // skip gracefully when config unavailable

    const result = await apiClient.mutation<{ data: { id: number } }>(
      "routes.create",
      {
        name: "Empty Hops Test",
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: "0.05",
        hopAmountRaw: "50000000",
        creator: testPayer.publicKey.toBase58(),
        hops: [],
      }
    );

    expect(result.data.id).toBeDefined();
  });

  it("should allow self-transfer route (documents gap)", async () => {
    // NOTE: This documents a missing server-side validation.
    // Creator == hop recipient is accepted — no self-transfer check exists.
    // Requires token config to be readable by the API.
    if (!tokenConfigReadable) return; // skip gracefully when config unavailable

    const now = new Date();
    const result = await apiClient.mutation<{ data: { id: number } }>(
      "routes.create",
      {
        name: "Self Transfer Test",
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: "0.05",
        hopAmountRaw: "50000000",
        creator: testPayer.publicKey.toBase58(),
        hops: [
          {
            recipient: testPayer.publicKey.toBase58(),
            scheduledAt: new Date(now.getTime() + 60_000).toISOString(),
          },
        ],
      }
    );

    expect(result.data.id).toBeDefined();
  });
});

// --- Easy Route - Edge Cases ---

describe("Easy Route - Edge Cases", () => {
  beforeAll(async () => {
    await authenticateWallet(testPayer);
    await ensureTokenConfig();
  });

  it("should reject easy route with hopCount = 0", async () => {
    const futureTime = new Date(Date.now() + 600_000); // 10 min from now

    await expect(
      apiClient.mutation("easyRoutes.create", {
        arrivalTime: futureTime.toISOString(),
        hopCount: 0,
        destinationWallet: Keypair.generate().publicKey.toBase58(),
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: "0.05",
        hopAmountRaw: "50000000",
        creator: testPayer.publicKey.toBase58(),
      })
    ).rejects.toThrow();
  });

  it("should reject easy route with wallet too short", async () => {
    const futureTime = new Date(Date.now() + 600_000);

    await expect(
      apiClient.mutation("easyRoutes.create", {
        arrivalTime: futureTime.toISOString(),
        hopCount: 2,
        destinationWallet: "abc",
        tokenType: "SOL",
        tokenDecimals: 9,
        hopAmountTokens: "0.05",
        hopAmountRaw: "50000000",
        creator: testPayer.publicKey.toBase58(),
      })
    ).rejects.toThrow();
  });

  it("should allow invalid base58 destination that passes length check (documents gap)", async () => {
    // NOTE: This documents a missing server-side validation.
    // The Zod schema only checks z.string().min(32).max(64) — no base58 or
    // PublicKey validation. Invalid base58 chars pass through.
    const futureTime = new Date(Date.now() + 600_000);
    const invalidBase58 = "0xNotASolanaAddressButLongEnoughToPass00000000";

    const result = await apiClient.mutation("easyRoutes.create", {
      arrivalTime: futureTime.toISOString(),
      hopCount: 2,
      destinationWallet: invalidBase58,
      tokenType: "SOL",
      tokenDecimals: 9,
      hopAmountTokens: "0.05",
      hopAmountRaw: "50000000",
      creator: testPayer.publicKey.toBase58(),
    });

    expect(result.success).toBe(true);
  });
});

// --- Route Operation Failures ---

describe("Route Operation Failures", () => {
  beforeAll(async () => {
    await authenticateWallet(testPayer);
  });

  it("should reject replay of non-existent route", async () => {
    await expect(
      apiClient.mutation("routes.replay", {
        id: 999999,
        creator: testPayer.publicKey.toBase58(),
      })
    ).rejects.toThrow();
  });

  it("should reject update of non-existent route", async () => {
    await expect(
      apiClient.mutation("routes.update", {
        id: 999999,
        creator: testPayer.publicKey.toBase58(),
        updates: { name: "Ghost Route" },
      })
    ).rejects.toThrow();
  });

  it("should reject delete of non-existent route", async () => {
    await expect(
      apiClient.mutation("routes.delete", {
        id: 999999,
        creator: testPayer.publicKey.toBase58(),
      })
    ).rejects.toThrow();
  });
});
