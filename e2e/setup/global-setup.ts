import { execSync, spawn, ChildProcess } from "child_process";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import crypto from "crypto";
import path from "path";
import {
  waitForPostgres,
  waitForSolanaValidator,
} from "../helpers/wait-for-services";
import { airdrop } from "../helpers/airdrop";

const SOLANA_RPC_URL = "http://localhost:8899";
const API_URL = "http://localhost:3001";
const TEST_PAYER_SEED = crypto
  .createHash("sha256")
  .update("e2e_test_payer")
  .digest()
  .slice(0, 32);

let validatorProcess: ChildProcess | null = null;

function startLocalValidator(): ChildProcess {
  const fixturesDir = path.resolve(__dirname, "../fixtures");

  const proc = spawn(
    "solana-test-validator",
    [
      "--reset",
      "--bind-address",
      "127.0.0.1",
      "--rpc-port",
      "8899",
      "--ticks-per-slot",
      "16",
      "--bpf-program",
      "3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh",
      path.join(fixturesDir, "multi_hopper_project.so"),
      "--bpf-program",
      "2JEv3pD6nczEvn1xDXaEzehkJofPPjoQQpnW5nGY3r52",
      path.join(fixturesDir, "transfer_hook_guard.so"),
      "--bpf-program",
      "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      path.join(fixturesDir, "spl_token_2022.so"),
    ],
    {
      stdio: "pipe",
      detached: false,
    }
  );

  proc.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[validator] ${msg}`);
  });

  proc.on("error", (err) => {
    console.error(`Validator process error: ${err.message}`);
  });

  return proc;
}

async function waitForApi(
  url: string,
  timeoutMs: number = 120_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) {
        console.log("API ready");
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`API did not become healthy within ${timeoutMs}ms`);
}

export async function setup() {
  console.log("\n=== E2E Global Setup ===\n");

  const isCI = !!process.env.CI;

  if (!isCI) {
    // 1. Start local solana-test-validator
    console.log("Starting local solana-test-validator...");
    validatorProcess = startLocalValidator();
    await waitForSolanaValidator(SOLANA_RPC_URL, 30_000);

    // 2. Start Docker containers (postgres + api)
    console.log("Starting Docker containers...");
    execSync("docker compose -f docker-compose.e2e.yml up -d --build", {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  } else {
    console.log("CI detected — skipping local validator and docker compose");
  }

  // 3. Wait for remaining services
  console.log("\nWaiting for services...");
  await waitForSolanaValidator(SOLANA_RPC_URL, 60_000);
  await waitForPostgres("localhost", 5434, 30_000);
  await waitForApi(API_URL, 120_000);

  // 4. Airdrop SOL to test payer
  console.log("\nAirdropping SOL to test payer...");
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const testPayer = Keypair.fromSeed(TEST_PAYER_SEED);
  console.log(`Test payer: ${testPayer.publicKey.toBase58()}`);

  await airdrop(connection, testPayer.publicKey, 100);
  const balance = await connection.getBalance(testPayer.publicKey);
  console.log(`Test payer balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  console.log("\n=== E2E Global Setup Complete ===\n");
}

export async function teardown() {
  console.log("\n=== E2E Global Teardown ===\n");

  if (!process.env.CI) {
    execSync("docker compose -f docker-compose.e2e.yml down -v", {
      cwd: process.cwd(),
      stdio: "inherit",
    });
    console.log("Docker containers stopped and volumes removed");

    if (validatorProcess && !validatorProcess.killed) {
      validatorProcess.kill("SIGTERM");
      console.log("Local solana-test-validator stopped");
    }
  } else {
    console.log("CI detected — skipping local teardown");
  }
}
