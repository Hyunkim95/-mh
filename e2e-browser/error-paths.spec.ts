import { test, expect } from "@playwright/test";
import {
  solana,
  login,
  selectTokenAndConfigure,
  setAmount,
  clickNextStep,
  selectEasyMode,
  selectCustomMode,
  setRouteName,
  fillHopRow,
  setDestinationWallet,
  pickArrivalTime,
} from "./helpers";

// ─── Setup ──────────────────────────────────────────────────

test.beforeAll(async () => {
  solana("ensure-balance 5");
  solana("init-token-config");
});

// ─── Easy Route Form Validation ─────────────────────────────

test.describe("Form Validation Errors - Easy Route", () => {
  test("invalid destination wallet shows error", async ({ page }) => {
    await login(page);
    await selectTokenAndConfigure(page, "SOL");
    await setAmount(page, "0.05");
    await clickNextStep(page);
    await selectEasyMode(page);
    await pickArrivalTime(page);
    await setDestinationWallet(page, "not-a-valid-solana-address");

    // Error message should be visible
    await expect(page.locator("text=Invalid Solana address")).toBeVisible({
      timeout: 5_000,
    });

    // Next step button should be disabled
    const nextBtn = page.locator('[data-testid="next-step-btn"]');
    await expect(nextBtn).toBeDisabled();
  });

  test("empty destination wallet prevents advancing", async ({ page }) => {
    await login(page);
    await selectTokenAndConfigure(page, "SOL");
    await setAmount(page, "0.05");
    await clickNextStep(page);
    await selectEasyMode(page);
    await pickArrivalTime(page);

    // Leave destination wallet empty — next step should be disabled
    const nextBtn = page.locator('[data-testid="next-step-btn"]');
    await expect(nextBtn).toBeDisabled();
  });

  test("no arrival time prevents advancing", async ({ page }) => {
    await login(page);
    await selectTokenAndConfigure(page, "SOL");
    await setAmount(page, "0.05");
    await clickNextStep(page);
    await selectEasyMode(page);

    // Fill a valid wallet but skip arrival time
    const validWallet = solana("recipient-pubkey");
    await setDestinationWallet(page, validWallet);

    // Next step should be disabled (no arrival time selected)
    const nextBtn = page.locator('[data-testid="next-step-btn"]');
    await expect(nextBtn).toBeDisabled();
  });
});

// ─── Custom Route Form Validation ───────────────────────────

test.describe("Form Validation Errors - Custom Route", () => {
  test("invalid wallet in custom hop row shows error", async ({ page }) => {
    await login(page);
    await selectTokenAndConfigure(page, "SOL");
    await setAmount(page, "0.05");
    await clickNextStep(page);
    await selectCustomMode(page);
    await setRouteName(page, "Error Test Route");

    // Fill hop 0 with invalid wallet + Tab (triggers onBlur validation)
    const walletInput = page.locator("#hop-wallet-desktop-0");
    await walletInput.waitFor({ state: "visible", timeout: 5_000 });
    await walletInput.fill("not-a-valid-address");
    await walletInput.press("Tab");
    await page.waitForTimeout(500);

    // Error text should appear in the hop row
    await expect(page.locator("text=Invalid Solana address")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("empty route name prevents advancing", async ({ page }) => {
    await login(page);
    await selectTokenAndConfigure(page, "SOL");
    await setAmount(page, "0.05");
    await clickNextStep(page);
    await selectCustomMode(page);

    // Fill a valid hop but leave route name empty
    const validWallet = solana("recipient-pubkey");
    await fillHopRow(page, 0, validWallet, "2m");

    // Next step should be disabled (no route name)
    const nextBtn = page.locator('[data-testid="next-step-btn"]');
    await expect(nextBtn).toBeDisabled();
  });
});
