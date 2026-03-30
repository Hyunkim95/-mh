import { test, expect } from "@playwright/test";
import {
  solana,
  login,
  selectSplTokenManually,
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

let splMint: string;

// 3 deterministic recipients for custom SPL hops
const recipient1 = solana("generate-keypair e2e_custom_spl_r1");
const recipient2 = solana("generate-keypair e2e_custom_spl_r2");
const recipient3 = solana("generate-keypair e2e_custom_spl_r3");

test.describe("Custom Route SPL - Full Browser Flow", () => {
  test.beforeAll(async () => {
    solana("ensure-balance 10");
    solana("init-token-config");

    // Create fresh SPL mint and mint tokens
    splMint = solana("create-spl-mint 6 1000000");
    console.log(`Test SPL mint: ${splMint}`);

    solana(`init-spl-token-config ${splMint}`);
  });

  test("should create and deploy a custom SPL route with 3 hops", async ({
    page,
  }) => {
    // ── Step 1: Login ──
    await login(page);
    await expect(page).toHaveURL(/my-assets/);

    // ── Step 2: Select SPL token via Manual Input (Helius API unavailable on local validator) ──
    await selectSplTokenManually(page, splMint);

    // ── Step 3: Set amount ──
    await setAmount(page, "100");

    // ── Step 4: Click Next Step ──
    await clickNextStep(page);

    // ── Step 5: Select Custom Route mode ──
    await selectCustomMode(page);

    // ── Step 6: Configure Custom Route ──
    await setRouteName(page, "E2E Custom SPL Route");

    await fillHopRow(page, 0, recipient1, "2m");

    await addHopRow(page);
    await fillHopRow(page, 1, recipient2, "5m");

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
