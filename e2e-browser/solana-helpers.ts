/**
 * Solana helpers for browser E2E tests.
 *
 * These run in Node and are invoked from the Playwright test via execSync
 * to avoid ESM/CJS conflicts with @solana/web3.js in Playwright's ESM test runner.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import crypto from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";

const SOLANA_RPC_URL = "http://localhost:8899";
const API_URL = "http://localhost:3001";
const PG_CONNECTION_STRING = "postgresql://trpc_user:trpc_password@localhost:5434/trpc_e2e";
const connection = new Connection(SOLANA_RPC_URL, "confirmed");

const TEST_PAYER_SEED = crypto
  .createHash("sha256")
  .update("e2e_test_payer")
  .digest()
  .slice(0, 32);
const testPayer = Keypair.fromSeed(TEST_PAYER_SEED);

const RECIPIENT_SEED = crypto
  .createHash("sha256")
  .update("e2e_test_recipient_browser")
  .digest()
  .slice(0, 32);
const recipient = Keypair.fromSeed(RECIPIENT_SEED);
let cachedAuthToken: string | null = null;

// ─── Utilities ───────────────────────────────────────────────

function keypairFromSeed(seedString: string): Keypair {
  const seed = crypto
    .createHash("sha256")
    .update(seedString)
    .digest()
    .slice(0, 32);
  return Keypair.fromSeed(seed);
}

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 30,
  delayMs = 2000
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err: any) {
      if (err?.cause?.code === "ECONNREFUSED" && i < maxRetries - 1) {
        console.log(`API not ready, retrying in ${delayMs}ms... (${i + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed to reach API after ${maxRetries} retries`);
}

async function getAuthToken(): Promise<string> {
  if (cachedAuthToken) {
    return cachedAuthToken;
  }

  const challengeRes = await fetchWithRetry(`${API_URL}/trpc/auth.createMessage`, {
    method: "POST",
  });
  if (!challengeRes.ok) {
    throw new Error(`auth.createMessage failed: ${await challengeRes.text()}`);
  }

  const challengeJson = await challengeRes.json();
  const nonce = challengeJson.result?.data?.nonce;
  const message = challengeJson.result?.data?.message;

  if (!nonce || !message) {
    throw new Error(`Invalid auth challenge response: ${JSON.stringify(challengeJson)}`);
  }

  const signature = bs58.encode(
    nacl.sign.detached(Buffer.from(message, "utf-8"), testPayer.secretKey)
  );

  const verifyRes = await fetchWithRetry(`${API_URL}/trpc/auth.verifyUserWithSignature`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nonce,
      address: testPayer.publicKey.toBase58(),
      signature,
      isHardwareWallet: false,
    }),
  });

  if (!verifyRes.ok) {
    throw new Error(`auth.verifyUserWithSignature failed: ${await verifyRes.text()}`);
  }

  const verifyJson = await verifyRes.json();
  const token = verifyJson.result?.data?.token;
  if (!token) {
    throw new Error(`No auth token returned: ${JSON.stringify(verifyJson)}`);
  }

  cachedAuthToken = token;
  return token;
}

async function fetchAuthed(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  return fetchWithRetry(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const cmd = process.argv[2];

  switch (cmd) {
    case "payer-pubkey":
      console.log(testPayer.publicKey.toBase58());
      break;

    case "recipient-pubkey":
      console.log(recipient.publicKey.toBase58());
      break;

    case "generate-keypair": {
      const seedStr = process.argv[3];
      if (!seedStr) throw new Error("Usage: generate-keypair <seed-string>");
      const kp = keypairFromSeed(seedStr);
      console.log(kp.publicKey.toBase58());
      break;
    }

    case "ensure-balance": {
      const minSol = Number(process.argv[3]) || 5;
      const target = minSol * LAMPORTS_PER_SOL;
      let balance = await connection.getBalance(testPayer.publicKey);
      while (balance < target) {
        // Request airdrop with retry
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            await connection.requestAirdrop(
              testPayer.publicKey,
              2 * LAMPORTS_PER_SOL
            );
            break;
          } catch (err) {
            if (attempt === 5) throw err;
            console.log(`Airdrop attempt ${attempt}/5 failed, retrying...`);
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
        // Poll for balance change instead of confirming tx signature
        const deadline = Date.now() + 30_000;
        const prev = balance;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1000));
          balance = await connection.getBalance(testPayer.publicKey);
          if (balance > prev) break;
        }
        if (balance <= prev) {
          throw new Error(`Airdrop not reflected after 30s (balance: ${balance})`);
        }
      }
      console.log(`${balance / LAMPORTS_PER_SOL}`);
      break;
    }

    case "get-balance": {
      const pubkey = new PublicKey(process.argv[3]);
      const balance = await connection.getBalance(pubkey);
      console.log(balance.toString());
      break;
    }

    // ─── SPL helpers ──────────────────────────────────────────

    case "create-spl-mint": {
      const decimals = Number(process.argv[3]) || 6;
      const amount = Number(process.argv[4]) || 1_000_000;

      // Create mint with testPayer as authority
      const mint = await createMint(
        connection,
        testPayer,
        testPayer.publicKey, // mintAuthority
        testPayer.publicKey, // freezeAuthority
        decimals
      );

      // Mint tokens to testPayer's ATA
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        testPayer,
        mint,
        testPayer.publicKey
      );
      const rawAmount = amount * 10 ** decimals;
      await mintTo(connection, testPayer, mint, ata.address, testPayer, rawAmount);

      // Output mint address (parsed by test)
      console.log(mint.toBase58());
      break;
    }

    case "get-token-balance": {
      const mint = new PublicKey(process.argv[3]);
      const owner = new PublicKey(process.argv[4]);
      try {
        const ata = getAssociatedTokenAddressSync(mint, owner);
        const account = await getAccount(connection, ata);
        console.log(account.amount.toString());
      } catch {
        console.log("0");
      }
      break;
    }

    // ─── Token config helpers ─────────────────────────────────

    case "init-token-config": {
      // Check if SOL token config already exists
      const checkUrl = `${API_URL}/trpc/contract.getTokenConfigSOL?input=${encodeURIComponent(
        JSON.stringify({ creator: testPayer.publicKey.toBase58() })
      )}`;
      try {
        const checkRes = await fetchAuthed(checkUrl);
        const checkJson = await checkRes.json();
        if (checkJson.result?.data?.data) {
          console.log("Token config already exists");
          break;
        }
      } catch {
        // Not found, proceed to create
      }

      const initRes = await fetchAuthed(
        `${API_URL}/trpc/contract.initializeTokenConfigSOL`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
          }),
        }
      );

      if (!initRes.ok) {
        throw new Error(`initializeTokenConfigSOL failed: ${await initRes.text()}`);
      }

      const initJson = await initRes.json();
      const txBase64 = initJson.result?.data?.data?.transaction;
      if (!txBase64) {
        throw new Error("No transaction returned from initializeTokenConfigSOL");
      }

      const tx = Transaction.from(Buffer.from(txBase64, "base64"));
      const sig = await sendAndConfirmTransaction(connection, tx, [testPayer], {
        commitment: "confirmed",
      });
      console.log(`Token config initialized: ${sig}`);
      break;
    }

    case "create-draft-sol-route": {
      const routeName = process.argv[3] || `Browser Recovery ${Date.now()}`;
      const recipientCount = Number(process.argv[4] || "3");
      if (recipientCount < 1) {
        throw new Error("recipientCount must be at least 1");
      }

      const now = Date.now();
      const hops = Array.from({ length: recipientCount }, (_, index) => {
        const hopRecipient = keypairFromSeed(`${routeName}-recipient-${index + 1}`);
        return {
          recipient: hopRecipient.publicKey.toBase58(),
          scheduledAt: new Date(now + 60_000 + index * 120_000).toISOString(),
        };
      });

      const createRes = await fetchAuthed(`${API_URL}/trpc/routes.create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: routeName,
          tokenType: "SOL",
          tokenDecimals: 9,
          hopAmountTokens: "0.05",
          hopAmountRaw: String(Math.floor(0.05 * LAMPORTS_PER_SOL)),
          creator: testPayer.publicKey.toBase58(),
          hops,
        }),
      });

      if (!createRes.ok) {
        throw new Error(`routes.create failed: ${await createRes.text()}`);
      }

      const createJson = await createRes.json();
      const route = createJson.result?.data?.data;
      if (!route?.id || !route?.routeId) {
        throw new Error(`Invalid routes.create response: ${JSON.stringify(createJson)}`);
      }

      console.log(
        JSON.stringify({
          id: route.id,
          routeId: route.routeId,
          name: routeName,
          hops,
        })
      );
      break;
    }

    case "partial-init-sol-route": {
      const routeDbId = Number(process.argv[3]);
      if (!routeDbId) throw new Error("Usage: partial-init-sol-route <route-db-id>");

      const routeRes = await fetchAuthed(
        `${API_URL}/trpc/routes.getById?input=${encodeURIComponent(
          JSON.stringify({
            id: routeDbId,
            creator: testPayer.publicKey.toBase58(),
          })
        )}`
      );
      if (!routeRes.ok) {
        throw new Error(`routes.getById failed: ${await routeRes.text()}`);
      }
      const routeJson = await routeRes.json();
      const route = routeJson.result?.data?.data;
      if (!route?.routeId || !route?.hops?.length) {
        throw new Error(`Route not found or missing hops: ${JSON.stringify(routeJson)}`);
      }

      const initRes = await fetchAuthed(`${API_URL}/trpc/contract.initializeRouteSOL`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeId: route.routeId,
          hops: route.hops.map((hop: any) => ({
            recipient: hop.recipient,
            scheduledAt:
              typeof hop.scheduledAt === "string"
                ? new Date(hop.scheduledAt).getTime()
                : hop.scheduledAt,
          })),
          hopAmount: route.hopAmountRaw,
          splMint: "So11111111111111111111111111111111111111112",
        }),
      });

      if (!initRes.ok) {
        throw new Error(`initializeRouteSOL failed: ${await initRes.text()}`);
      }

      const initJson = await initRes.json();
      const initData = initJson.result?.data?.data;
      const txBase64 = initData?.transaction;
      if (!txBase64) {
        throw new Error(`No transaction returned from initializeRouteSOL: ${JSON.stringify(initJson)}`);
      }

      const tx = Transaction.from(Buffer.from(txBase64, "base64"));
      const signers = [testPayer];
      if (initData.additionalSignerSecret) {
        signers.push(
          Keypair.fromSecretKey(bs58.decode(initData.additionalSignerSecret))
        );
      }
      const signature = await sendAndConfirmTransaction(connection, tx, signers, {
        commitment: "confirmed",
      });

      const pg = await import("pg");
      const client = new pg.default.Client({ connectionString: PG_CONNECTION_STRING });
      await client.connect();
      try {
        await client.query(
          `UPDATE routes
           SET status = 'deployed',
               deployed_at = NOW(),
               deployment_tx_hash = $1
           WHERE id = $2`,
          [signature, routeDbId]
        );
      } finally {
        await client.end();
      }

      console.log(
        JSON.stringify({
          id: routeDbId,
          routeId: route.routeId,
          deploymentTxHash: signature,
        })
      );
      break;
    }

    case "get-route-state": {
      const routeId = Number(process.argv[3]);
      if (!routeId) throw new Error("Usage: get-route-state <on-chain-route-id>");

      const stateRes = await fetchAuthed(
        `${API_URL}/trpc/contract.getRouteState?input=${encodeURIComponent(
          JSON.stringify({ routeId })
        )}`
      );
      if (!stateRes.ok) {
        throw new Error(`contract.getRouteState failed: ${await stateRes.text()}`);
      }

      const stateJson = await stateRes.json();
      console.log(JSON.stringify(stateJson.result?.data?.data ?? null));
      break;
    }

    case "init-spl-token-config": {
      const mintAddr = process.argv[3];
      if (!mintAddr) throw new Error("Usage: init-spl-token-config <mint-address>");

      // Check if SPL token config already exists
      const checkUrl = `${API_URL}/trpc/contract.getTokenConfigSPL`;
      try {
        const checkRes = await fetchAuthed(checkUrl);
        const checkJson = await checkRes.json();
        if (checkJson.result?.data?.data) {
          console.log("SPL token config already exists");
          break;
        }
      } catch {
        // Not found, proceed to create
      }

      const initRes = await fetchAuthed(
        `${API_URL}/trpc/contract.initializeTokenConfig`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
          }),
        }
      );

      if (!initRes.ok) {
        throw new Error(`initializeTokenConfig (SPL) failed: ${await initRes.text()}`);
      }

      const splInitJson = await initRes.json();
      const splTxBase64 = splInitJson.result?.data?.data?.transaction;
      if (!splTxBase64) {
        throw new Error("No transaction returned from initializeTokenConfig (SPL)");
      }

      const splTx = Transaction.from(Buffer.from(splTxBase64, "base64"));
      const splSig = await sendAndConfirmTransaction(connection, splTx, [testPayer], {
        commitment: "confirmed",
      });
      console.log(`SPL token config initialized: ${splSig}`);
      break;
    }

    case "get-token-config": {
      // Use SPL endpoint (no input required, same PDA as SOL)
      const configUrl = `${API_URL}/trpc/contract.getTokenConfigSPL`;
      const configRes = await fetchAuthed(configUrl);
      const configJson = await configRes.json();
      const data = configJson.result?.data?.data;
      if (!data) {
        throw new Error(`Token config not found. Raw response: ${JSON.stringify(configJson)}`);
      }
      // Output as JSON so test can parse it
      console.log(JSON.stringify(data));
      break;
    }

    // ─── Admin helpers ────────────────────────────────────────

    case "set-admin-role":
    case "set-user-role": {
      const targetRole = cmd === "set-admin-role" ? "admin" : "user";
      // Dynamic import pg to avoid loading it for non-admin commands
      const pg = await import("pg");
      const client = new pg.default.Client({ connectionString: PG_CONNECTION_STRING });
      await client.connect();
      try {
        const pubkey = testPayer.publicKey.toBase58();
        const result = await client.query(
          `UPDATE "user" SET role = $1 WHERE public_key = $2`,
          [targetRole, pubkey]
        );
        if (result.rowCount === 0) {
          console.log(`No user found with pubkey ${pubkey} — login first`);
        } else {
          console.log(`Set ${targetRole} role for ${pubkey}`);
        }
      } finally {
        await client.end();
      }
      break;
    }

    case "auth-token": {
      const token = await getAuthToken();
      console.log(token);
      break;
    }

    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
