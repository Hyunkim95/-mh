/**
 * Shared helpers for browser E2E specs.
 *
 * Centralizes login, navigation, route configuration, deployment,
 * and polling logic used across all browser E2E tests.
 */
import { type Page, expect } from "@playwright/test";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HELPERS = path.resolve(__dirname, "solana-helpers.ts");
const BETA_ACCESS_STORAGE_KEY = "mh_routing_upgrade_bypass_v1";

// ─── CLI helper ──────────────────────────────────────────────

export function solana(cmd: string): string {
  try {
    return execSync(`npx tsx ${HELPERS} ${cmd}`, {
      encoding: "utf-8",
      timeout: 120_000,
    }).trim();
  } catch (err: any) {
    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";
    console.error(`solana-helpers "${cmd}" failed:\nstdout: ${stdout}\nstderr: ${stderr}`);
    throw err;
  }
}

// ─── Login ───────────────────────────────────────────────────

export async function login(page: Page) {
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, "true");
  }, BETA_ACCESS_STORAGE_KEY);

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[BROWSER error] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    console.log(`[PAGE ERROR] ${err.message}`);
  });

  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  // Click the Test Wallet tile
  const walletTile = page.locator('[data-testid="wallet-tile-test-wallet"]');
  await walletTile.waitFor({ state: "visible", timeout: 15_000 });
  await walletTile.click();

  // Wait for wallet to connect then sign
  const signBtn = page.locator('[data-testid="sign-message-btn"]');
  await expect(signBtn).toBeEnabled({ timeout: 10_000 });
  await signBtn.click();

  // Wait for navigation to /my-assets
  await page.waitForURL("**/my-assets", { timeout: 30_000 });
  console.log("Login complete");
}

async function waitForSessionRole(page: Page, expectedRole: "user" | "admin") {
  await page.waitForFunction(
    async ({ role }) => {
      const token = window.localStorage.getItem("token");
      if (!token) return false;

      const response = await fetch("/trpc/auth.me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) return false;

      const json = await response.json();
      return json?.result?.data?.role === role;
    },
    { role: expectedRole },
    { timeout: 15_000 }
  );
}

/**
 * Login, set admin role in DB, then re-authenticate to get a new JWT with admin role.
 */
export async function loginAsAdmin(page: Page) {
  // First login creates the user record in the DB
  await login(page);

  // Set admin role in DB, then mint a fresh admin JWT directly from the test helper.
  // This avoids depending on a second browser-side auth roundtrip to update role state.
  solana("set-admin-role");
  const adminToken = solana("auth-token");
  await page.evaluate((token) => {
    window.localStorage.setItem("token", token);
  }, adminToken);
  await page.reload();
  await page.waitForURL("**/my-assets", { timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Admin Dashboard" })
  ).toBeVisible({ timeout: 15_000 });
  console.log("Admin login complete");
}

// ─── Token selection ─────────────────────────────────────────

/**
 * Select a token on the MyAssets page and navigate to configure hops.
 * @param tokenName - Text to match on the token card (e.g. "SOL", the SPL token symbol)
 */
export async function selectTokenAndConfigure(page: Page, tokenName: string) {
  const tokenCard = page.locator(`text=${tokenName}`).first();
  await tokenCard.waitFor({ state: "visible", timeout: 20_000 });
  await tokenCard.click();

  const configureBtn = page.locator("text=Configure Route");
  await expect(configureBtn).toBeEnabled({ timeout: 5_000 });
  await configureBtn.click();

  await page.waitForURL("**/configure-hops**", { timeout: 10_000 });
  console.log(`Navigated to configure-hops for ${tokenName}`);
}

/**
 * Select an SPL token via "Manual Input" mode (for local validator where Helius API is unavailable).
 * Enters the mint address, waits for validation, then clicks Configure Route.
 */
export async function selectSplTokenManually(page: Page, mintAddress: string) {
  // Switch to Manual Input tab
  const manualBtn = page.locator("button:has-text('Manual Input')");
  await manualBtn.waitFor({ state: "visible", timeout: 10_000 });
  await manualBtn.click();
  console.log("Switched to Manual Input mode");

  // Enter mint address
  const mintInput = page.locator(
    'input[placeholder="Enter SPL token mint address"]'
  );
  await mintInput.waitFor({ state: "visible", timeout: 5_000 });
  await mintInput.fill(mintAddress);
  console.log(`Entered mint address: ${mintAddress}`);

  // Wait for validation to complete (token card should appear)
  const tokenCard = page.locator("text=Manual Token");
  await tokenCard.waitFor({ state: "visible", timeout: 15_000 });
  await tokenCard.click();
  console.log("Manual token validated and selected");

  const configureBtn = page.locator("text=Configure Route");
  await expect(configureBtn).toBeEnabled({ timeout: 5_000 });
  await configureBtn.click();

  await page.waitForURL("**/configure-hops**", { timeout: 10_000 });
  console.log(`Navigated to configure-hops for SPL token ${mintAddress.slice(0, 8)}...`);
}

// ─── Amount ──────────────────────────────────────────────────

export async function setAmount(page: Page, amount: string) {
  const amountDisplay = page.locator('[data-testid="amount-display"]');
  await amountDisplay.click();

  const amountInput = page.locator('[data-testid="amount-input"]');
  await amountInput.waitFor({ state: "visible", timeout: 5_000 });
  await amountInput.fill(amount);
  await amountInput.press("Enter");
  console.log(`Amount set to ${amount}`);
}

// ─── Mode selection ──────────────────────────────────────────

export async function clickNextStep(page: Page) {
  await page.locator('[data-testid="next-step-btn"]').click();
}

export async function selectEasyMode(page: Page) {
  const easyMode = page.locator('[data-testid="mode-easy"]');
  await easyMode.waitFor({ state: "visible", timeout: 5_000 });
  await easyMode.click();
  await clickNextStep(page);
  console.log("Easy Route mode selected");
}

export async function selectCustomMode(page: Page) {
  const customMode = page.locator('[data-testid="mode-custom"]');
  await customMode.waitFor({ state: "visible", timeout: 5_000 });
  await customMode.click();
  await clickNextStep(page);
  console.log("Custom Route mode selected");
}

// ─── Easy Route configuration ────────────────────────────────

/**
 * Pick arrival time using react-datepicker.
 * Selects the latest available time today (or first available future time).
 */
export async function pickArrivalTime(page: Page) {
  const arrivalSection = page.locator("text=Select Date");
  await arrivalSection.click();

  const calendar = page.locator(".react-datepicker");
  await calendar.waitFor({ state: "visible", timeout: 5_000 });

  // Click today's date
  const today = new Date();
  const dayOfMonth = today.getDate();
  const dayButton = page
    .locator(
      `.react-datepicker__day:not(.react-datepicker__day--disabled):not(.react-datepicker__day--outside-month)`
    )
    .filter({ hasText: new RegExp(`^${dayOfMonth}$`) });
  await dayButton.first().click();

  // Select the first available time slot
  const timeList = page.locator(".react-datepicker__time-list");
  await timeList.waitFor({ state: "visible", timeout: 5_000 });

  const availableTime = page
    .locator(
      ".react-datepicker__time-list-item:not(.react-datepicker__time-list-item--disabled)"
    )
    .first();
  await availableTime.click();
  console.log("Arrival time picked");
}

/**
 * Set the hop count in Easy Route mode by clicking +/- buttons.
 * Default is 3, so this adjusts relative to that.
 */
export async function setHopCount(page: Page, targetCount: number) {
  // The hop counter has + and - buttons around a center display
  const plusBtn = page.locator("button:has-text('+')").last();
  const minusBtn = page.locator("button:has-text('-')").last();

  // Assume default is 3; adjust up or down
  const defaultCount = 3;
  const diff = targetCount - defaultCount;

  if (diff > 0) {
    for (let i = 0; i < diff; i++) {
      await plusBtn.click();
      await page.waitForTimeout(200);
    }
  } else if (diff < 0) {
    for (let i = 0; i < Math.abs(diff); i++) {
      await minusBtn.click();
      await page.waitForTimeout(200);
    }
  }
  console.log(`Hop count set to ${targetCount}`);
}

export async function setDestinationWallet(page: Page, wallet: string) {
  const walletInput = page.locator('[data-testid="destination-wallet-input"]');
  await walletInput.fill(wallet);
  await walletInput.press("Tab");
  await page.waitForTimeout(1000);
  console.log(`Destination wallet set: ${wallet}`);
}

// ─── Custom Route configuration ─────────────────────────────

export async function setRouteName(page: Page, name: string) {
  const nameInput = page.locator('input[placeholder="Name your Route"]');
  await nameInput.fill(name);
  console.log(`Route name set: ${name}`);
}

/**
 * Fill a custom hop row with wallet address and delay.
 * Uses desktop layout selectors (#hop-wallet-desktop-{index}).
 */
export async function fillHopRow(
  page: Page,
  index: number,
  wallet: string,
  delayLabel: "2m" | "5m" | "10m"
) {
  const walletInput = page.locator(`#hop-wallet-desktop-${index}`);
  await walletInput.waitFor({ state: "visible", timeout: 5_000 });
  await walletInput.fill(wallet);
  await walletInput.press("Tab");
  await page.waitForTimeout(500);

  // Click the delay button for this row
  // The delay buttons are within the same row — find by text within the row's parent
  const row = walletInput.locator("xpath=ancestor::div[contains(@class,'sm:grid')]");
  const delayBtn = row.locator(`button:has-text("${delayLabel}")`);
  await delayBtn.click();

  console.log(`Hop ${index}: wallet=${wallet.slice(0, 8)}..., delay=${delayLabel}`);
}

export async function addHopRow(page: Page) {
  const addBtn = page.locator("button:has-text('+')").last();
  await addBtn.click();
  await page.waitForTimeout(500);
}

// ─── Deploy ──────────────────────────────────────────────────

export async function confirmAndDeploy(page: Page) {
  // Confirm route
  const confirmBtn = page.locator('[data-testid="confirm-route-btn"]');
  await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
  await confirmBtn.click();
  console.log("Route confirmed, waiting for deploy modal...");

  // Deploy Now
  const deployNow = page.locator('[data-testid="deploy-now-btn"]');
  await deployNow.waitFor({ state: "visible", timeout: 30_000 });
  console.log("Deploy modal visible, clicking Deploy Now...");
  await deployNow.click();
}

export async function waitForDeploySuccess(page: Page, timeoutMs = 120_000) {
  const deploySuccess = page.locator('[data-testid="deploy-success"]');
  await deploySuccess.waitFor({ state: "visible", timeout: timeoutMs });
  await expect(page.locator("text=Your route is now live!")).toBeVisible();
  console.log("Deployment successful!");
}

// ─── History verification ────────────────────────────────────

/**
 * Verify the route appears on the history page after deployment.
 * Checks for a route status badge (any status) to confirm the route was created.
 */
export async function verifyRouteOnHistory(page: Page) {
  await page.waitForURL("**/history", { timeout: 15_000 });
  console.log("Redirected to history page");

  // Wait for at least one route status badge to appear
  const statusBadge = page.locator('[data-testid^="route-status-"]').first();
  await statusBadge.waitFor({ state: "visible", timeout: 15_000 });
  const status = (await statusBadge.textContent())?.trim();
  console.log(`Route visible on history page with status: ${status}`);
}
