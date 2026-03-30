/**
 * Playwright global setup — self-contained to avoid cross-tsconfig TS imports.
 *
 * Starts solana-test-validator, Docker containers, waits for services,
 * and airdrops SOL to the test payer.
 */
import { execSync, spawn } from "child_process";
import path from "path";
import fs from "fs";
import net from "net";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(ROOT, "e2e", "fixtures");
const PID_FILE = path.join(__dirname, ".validator-pid");
const SOLANA_RPC = "http://localhost:8899";
const API_URL = "http://localhost:3001";
const HELPERS = path.resolve(__dirname, "solana-helpers.ts");

function solana(cmd: string): string {
  return execSync(`npx tsx ${HELPERS} ${cmd}`, {
    encoding: "utf-8",
    timeout: 60_000,
    cwd: ROOT,
  }).trim();
}

async function waitForUrl(
  url: string,
  label: string,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`${label} ready`);
        return;
      }
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} not ready within ${timeoutMs}ms`);
}

async function waitForTcp(
  host: string,
  port: number,
  label: string,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const sock = net.createConnection({ host, port }, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on("error", () => {
        sock.destroy();
        resolve(false);
      });
      sock.setTimeout(2000, () => {
        sock.destroy();
        resolve(false);
      });
    });
    if (ok) {
      console.log(`${label} ready at ${host}:${port}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} not ready within ${timeoutMs}ms`);
}

function killExistingValidator() {
  try {
    // Kill any existing validator on port 8899
    const pids = execSync("lsof -ti:8899", { encoding: "utf-8" }).trim();
    if (pids) {
      for (const pid of pids.split("\n")) {
        try { process.kill(Number(pid), "SIGKILL"); } catch { /* already dead */ }
      }
      // Wait for port to be freed
      execSync("sleep 1");
    }
  } catch {
    // No process on port
  }

  // Also kill any stale validator by PID file
  if (fs.existsSync(PID_FILE)) {
    const pid = Number(fs.readFileSync(PID_FILE, "utf-8").trim());
    try { process.kill(pid, "SIGKILL"); } catch { /* already dead */ }
    fs.unlinkSync(PID_FILE);
  }
}

export default async function setup() {
  console.log("\n=== Browser E2E Global Setup ===\n");

  const isCI = !!process.env.CI;

  if (!isCI) {
    // 0. Kill any stale validator
    killExistingValidator();

    // 1. Start local solana-test-validator
    console.log("Starting solana-test-validator...");
    const validator = spawn(
      "solana-test-validator",
      [
        "--reset",
        "--bind-address", "127.0.0.1",
        "--rpc-port", "8899",
        "--ticks-per-slot", "16",
        "--bpf-program", "3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh",
        path.join(FIXTURES, "multi_hopper_project.so"),
        "--bpf-program", "2JEv3pD6nczEvn1xDXaEzehkJofPPjoQQpnW5nGY3r52",
        path.join(FIXTURES, "transfer_hook_guard.so"),
        "--bpf-program", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
        path.join(FIXTURES, "spl_token_2022.so"),
      ],
      { stdio: "pipe", detached: false }
    );
    validator.stderr?.on("data", (d: Buffer) => {
      const msg = d.toString().trim();
      if (msg) console.log(`[validator] ${msg}`);
    });
    validator.on("exit", (code) => {
      console.log(`[validator] exited with code ${code}`);
    });
    fs.writeFileSync(PID_FILE, String(validator.pid));

    await waitForUrl(`${SOLANA_RPC}/health`, "Solana validator", 30_000);

    // 2. Docker containers
    console.log("Starting Docker containers...");
    execSync("docker compose -f docker-compose.e2e.yml up -d --build", {
      cwd: ROOT,
      stdio: "inherit",
    });
  } else {
    console.log("CI detected — skipping local validator and docker compose");
  }

  // 3. Wait for services
  console.log("\nWaiting for services...");
  await waitForTcp("localhost", 5434, "Postgres", 30_000);
  await waitForUrl(`${SOLANA_RPC}/health`, "Solana validator", 60_000);
  await waitForUrl(`${API_URL}/health`, "API", 120_000);

  // 4. Airdrop SOL
  console.log("\nAirdropping SOL to test payer...");
  const balance = solana("ensure-balance 100");
  console.log(`Test payer balance: ${balance} SOL`);

  console.log("\n=== Browser E2E Global Setup Complete ===\n");
}
