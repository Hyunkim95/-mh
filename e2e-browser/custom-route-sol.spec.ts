import { test, expect } from "@playwright/test";
import {
  solana,
  login,
  selectTokenAndConfigure,
  setAmount,
  clickNextStep,
  selectCustomMode,
  setRouteName,
  fillHopRow,
  addHopRow,
  confirmAndDeploy,
  waitForDeploySuccess,
  verifyRouteOnHistory,
} from "./helpers";

// 3 deterministic recipients for custom route hops
const recipient1 = solana("generate-keypair e2e_custom_sol_r1");
const recipient2 = solana("generate-keypair e2e_custom_sol_r2");
const recipient3 = solana("generate-keypair e2e_custom_sol_r3");

test.describe("Custom Route SOL - Full Browser Flow", () => {
  test.beforeAll(async () => {
    solana("ensure-balance 10");
    solana("init-token-config");
  });

  test("should create and deploy a custom SOL route with 3 hops", async ({
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

    // ── Step 5: Select Custom Route mode ──
    await selectCustomMode(page);

    // ── Step 6: Configure Custom Route ──
    await setRouteName(page, "E2E Custom SOL Route");

    // Fill hop 1 (row 0 already exists)
    await fillHopRow(page, 0, recipient1, "2m");

    // Add and fill hop 2
    await addHopRow(page);
    await fillHopRow(page, 1, recipient2, "5m");

    // Add and fill hop 3 (final destination)
    await addHopRow(page);
    await fillHopRow(page, 2, recipient3, "2m");

    // ── Step 7: Click Next Step (configure → summary) ──
    await clickNextStep(page);

    // ── Step 8: Verify summary page ──
    await expect(page.locator("text=Final Destination").first()).toBeVisible({
      timeout: 5_000,
    });
    console.log("Summary page visible");

    // ── Step 9-10: Confirm + Deploy ──
    await confirmAndDeploy(page);
    await waitForDeploySuccess(page);

    // ── Step 11: Verify route on history ──
    await verifyRouteOnHistory(page);
  });
});
