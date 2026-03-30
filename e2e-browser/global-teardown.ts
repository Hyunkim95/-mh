/**
 * Playwright global teardown — self-contained.
 *
 * Stops Docker containers and kills the solana-test-validator.
 */
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PID_FILE = path.join(__dirname, ".validator-pid");

export default async function teardown() {
  console.log("\n=== Browser E2E Global Teardown ===\n");

  if (!process.env.CI) {
    // Stop docker containers
    try {
      execSync("docker compose -f docker-compose.e2e.yml down -v", {
        cwd: ROOT,
        stdio: "inherit",
      });
      console.log("Docker containers stopped");
    } catch (e) {
      console.error("Failed to stop Docker containers:", e);
    }

    // Kill validator by PID
    if (fs.existsSync(PID_FILE)) {
      const pid = Number(fs.readFileSync(PID_FILE, "utf-8").trim());
      try {
        process.kill(pid, "SIGTERM");
        console.log(`Validator (PID ${pid}) stopped`);
      } catch {
        // already dead
      }
      fs.unlinkSync(PID_FILE);
    }

    // Also kill any remaining validator processes
    try {
      execSync("pkill -f solana-test-validator 2>/dev/null", { stdio: "ignore" });
    } catch {
      // none found
    }
  } else {
    console.log("CI detected — skipping local teardown");
  }

  console.log("\n=== Browser E2E Global Teardown Complete ===\n");
}
