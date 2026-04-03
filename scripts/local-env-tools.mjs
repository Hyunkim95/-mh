import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const ENV_PATH = path.resolve(process.cwd(), ".env");

const envEntries = [
  {
    name: "SOLANA_RPC_URL",
    required: true,
    description: "Solana RPC endpoint for local development",
    defaultValue: "https://api.devnet.solana.com",
  },
  {
    name: "HELIUS_API",
    required: true,
    description: "Helius RPC endpoint with API key",
    manual: true,
  },
  {
    name: "EXECUTOR_SEED",
    required: true,
    description: "Seed used to derive deterministic executor wallets",
    generator: () => crypto.randomBytes(32).toString("hex"),
  },
  {
    name: "SIGNER_PRIVATE_KEY",
    required: true,
    description: "Base58-encoded Solana signer secret key",
    generator: () => bs58.encode(Keypair.generate().secretKey),
  },
  {
    name: "JWT_SECRET",
    required: true,
    description: "JWT signing secret",
    generator: () => crypto.randomBytes(32).toString("hex"),
  },
];

function parseEnvFile(content) {
  const values = new Map();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    values.set(key, value);
  }
  return values;
}

function readCurrentEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    return new Map();
  }
  return parseEnvFile(fs.readFileSync(ENV_PATH, "utf8"));
}

function statusLabel(value) {
  return value ? "set" : "missing";
}

function runCheck() {
  const env = readCurrentEnv();
  console.log(`Checking ${ENV_PATH}`);
  console.log("");

  let missingCount = 0;

  for (const entry of envEntries) {
    const value = env.get(entry.name);
    const missing = entry.required && !value;
    if (missing) missingCount++;

    console.log(
      `${entry.name}: ${statusLabel(value)}${entry.manual ? " (manual)" : ""}`
    );
    console.log(`  ${entry.description}`);
  }

  console.log("");
  if (missingCount === 0) {
    console.log("All required local dev env values are set.");
  } else {
    console.log(
      `${missingCount} required env value(s) are missing. Run 'yarn env:generate:local' to generate the safe defaults.`
    );
  }
}

function buildGeneratedEntries(existingEnv) {
  return envEntries
    .filter((entry) => !existingEnv.get(entry.name))
    .map((entry) => {
      if (entry.generator) {
        return [entry.name, entry.generator()];
      }
      if (entry.defaultValue) {
        return [entry.name, entry.defaultValue];
      }
      return [entry.name, ""];
    });
}

function runGenerate(write) {
  const env = readCurrentEnv();
  const generatedEntries = buildGeneratedEntries(env);

  if (generatedEntries.length === 0) {
    console.log("No missing env values to generate.");
    return;
  }

  const output = generatedEntries
    .map(([name, value]) => `${name}=${value}`)
    .join("\n");

  if (write) {
    const prefix =
      fs.existsSync(ENV_PATH) && fs.readFileSync(ENV_PATH, "utf8").trim()
        ? "\n"
        : "";
    fs.appendFileSync(ENV_PATH, `${prefix}${output}\n`);
    console.log(`Appended generated values to ${ENV_PATH}`);
  } else {
    console.log(output);
  }

  const manualMissing = envEntries.filter(
    (entry) => entry.manual && !env.get(entry.name)
  );
  if (manualMissing.length > 0) {
    console.log("");
    console.log("Manual values still required:");
    for (const entry of manualMissing) {
      console.log(`- ${entry.name}: ${entry.description}`);
    }
  }
}

const command = process.argv[2];
const write = process.argv.includes("--write");

if (command === "check") {
  runCheck();
} else if (command === "generate") {
  runGenerate(write);
} else {
  console.error(
    "Usage: node scripts/local-env-tools.mjs <check|generate> [--write]"
  );
  process.exit(1);
}
