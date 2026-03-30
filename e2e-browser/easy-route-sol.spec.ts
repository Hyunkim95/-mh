import { test, expect } from "@playwright/test";
import {
  solana,
  login,
  selectTokenAndConfigure,
  setAmount,
  clickNextStep,
  selectEasyMode,
  pickArrivalTime,
  setDestinationWallet,
  waitForDeploySuccess,
  verifyRouteOnHistory,
} from "./helpers";

const recipientPubkey = solana("recipient-pubkey");

// ─── Test ──────────────────────────────────────────────────

test.describe("Easy Route SOL - Full Browser Flow", () => {
  test.beforeAll(async () => {
    solana("ensure-balance 5");
    solana("init-token-config");
  });

  test("should create and deploy an easy SOL route through the UI", async ({
    page,
  }) => {
    // ── Step 1: Login ──
    await login(page);
    await expect(page).toHaveURL(/my-assets/);

    // ── Step 2: Select SOL and navigate to configure ──
    await selectTokenAndConfigure(page, "SOL");

    // ── Step 3: Set amount ──
    await setAmount(page, "0.05");

    // ── Step 4: Click Next Step (choose → mode) ──
    await clickNextStep(page);

    // ── Step 5: Select Easy Route mode ──
    await selectEasyMode(page);

    // ── Step 6: Configure Easy Route ──
    await pickArrivalTime(page);

    // Hop count defaults to 3 — keep it

    // Enter destination wallet
    await setDestinationWallet(page, recipientPubkey);

    // ── Step 7: Click Next Step (configure → summary) ──
    await clickNextStep(page);

    // ── Step 8: Verify summary ──
    await expect(page.locator("text=Quick Route Summary")).toBeVisible({
      timeout: 5_000,
    });
    console.log("Summary page visible");

    // ── Step 9: Confirm route and verify deploy modal fee display ──
    const confirmBtn = page.locator('[data-testid="confirm-route-btn"]');
    await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
    await confirmBtn.click();
    console.log("Route confirmed, waiting for deploy modal...");

    // Wait for deploy modal to open
    const deployNow = page.locator('[data-testid="deploy-now-btn"]');
    await deployNow.waitFor({ state: "visible", timeout: 30_000 });
    console.log("Deploy modal visible");

    // Verify cost breakdown is displayed
    await expect(page.locator('[data-testid="cost-breakdown"]')).toBeVisible();
    await expect(page.locator("text=Execution Fees")).toBeVisible();
    await expect(page.locator("text=Platform Fee").first()).toBeVisible();
    await expect(page.locator("text=Transaction Fees").first()).toBeVisible();
    await expect(page.locator("text=Account Rent")).toBeVisible();
    await expect(page.locator("text=Total Cost")).toBeVisible();

    // Verify total cost value matches expected format
    const totalCostValue = page.locator('[data-testid="cost-total-value"]');
    await expect(totalCostValue).toBeVisible();
    const costText = await totalCostValue.textContent();
    expect(costText).toMatch(/[\d.]+ SOL/);
    console.log(`Deploy modal cost breakdown verified. Total: ${costText}`);

    // ── Step 10: Deploy ──
    await deployNow.click();
    await waitForDeploySuccess(page);

    // ── Step 11: Verify route on history ──
    await verifyRouteOnHistory(page);
  });
});
