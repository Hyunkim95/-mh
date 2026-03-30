import { test, expect } from "@playwright/test";
import {
  solana,
  login,
  selectTokenAndConfigure,
  setAmount,
  clickNextStep,
  selectEasyMode,
  pickArrivalTime,
  setHopCount,
  setDestinationWallet,
  confirmAndDeploy,
  waitForDeploySuccess,
  verifyRouteOnHistory,
} from "./helpers";

const recipientPubkey = solana("generate-keypair e2e_many_hops_recipient");

// Random hop count between 4 and 7 (always > 3 to test batched addHops)
const hopCount = Math.floor(Math.random() * 4) + 4;

test.describe("Many Hops - Full Browser Flow", () => {
  test.beforeAll(async () => {
    solana("ensure-balance 20");
    solana("init-token-config");
  });

  test("should create and deploy an easy route with many hops", async ({
    page,
  }) => {
    console.log(`Testing with ${hopCount} hops (random 4-7)`);

    // ── Step 1: Login ──
    await login(page);
    await expect(page).toHaveURL(/my-assets/);

    // ── Step 2: Select SOL ──
    await selectTokenAndConfigure(page, "SOL");

    // ── Step 3: Set amount (higher for more hops) ──
    await setAmount(page, "0.1");

    // ── Step 4: Click Next Step ──
    await clickNextStep(page);

    // ── Step 5: Select Easy Route mode ──
    await selectEasyMode(page);

    // ── Step 6: Configure with many hops ──
    await pickArrivalTime(page);
    await setHopCount(page, hopCount);
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

    // Longer timeout for many hops (batched addHops)
    await waitForDeploySuccess(page, 180_000);

    // ── Step 11: Verify route on history ──
    await verifyRouteOnHistory(page);
  });
});
