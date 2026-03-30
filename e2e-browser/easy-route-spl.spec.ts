import { test, expect } from "@playwright/test";
import {
  solana,
  login,
  selectSplTokenManually,
  setAmount,
  clickNextStep,
  selectEasyMode,
  pickArrivalTime,
  setDestinationWallet,
  confirmAndDeploy,
  waitForDeploySuccess,
  verifyRouteOnHistory,
} from "./helpers";

let splMint: string;
const recipientPubkey = solana("generate-keypair e2e_spl_recipient");

test.describe("Easy Route SPL - Full Browser Flow", () => {
  test.beforeAll(async () => {
    solana("ensure-balance 10");
    solana("init-token-config");

    // Create fresh SPL mint and mint 1M tokens (6 decimals) to test payer
    splMint = solana("create-spl-mint 6 1000000");
    console.log(`Test SPL mint: ${splMint}`);

    // Initialize SPL token config on-chain
    solana(`init-spl-token-config ${splMint}`);
  });

  test("should create and deploy an easy SPL route through the UI", async ({
    page,
  }) => {
    // ── Step 1: Login ──
    await login(page);
    await expect(page).toHaveURL(/my-assets/);

    // ── Step 2: Select SPL token via Manual Input (Helius API unavailable on local validator) ──
    await selectSplTokenManually(page, splMint);

    // ── Step 3: Set amount ──
    await setAmount(page, "100");

    // ── Step 4: Click Next Step (choose → mode) ──
    await clickNextStep(page);

    // ── Step 5: Select Easy Route mode ──
    await selectEasyMode(page);

    // ── Step 6: Configure Easy Route ──
    await pickArrivalTime(page);
    await setDestinationWallet(page, recipientPubkey);

    // ── Step 7: Click Next Step (configure → summary) ──
    await clickNextStep(page);

    // ── Step 8: Verify summary ──
    await expect(page.locator("text=Quick Route Summary")).toBeVisible({
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
