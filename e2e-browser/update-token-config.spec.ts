import { test, expect } from "@playwright/test";
import { solana, loginAsAdmin } from "./helpers";

test.describe("Update Token Config - Admin Dashboard", () => {
  test.beforeAll(async () => {
    solana("ensure-balance 10");
    solana("init-token-config");
  });

  test("should update SPL token config via admin dashboard", async ({
    page,
  }) => {
    // ── Step 1: Login as admin (login → set-admin-role → re-login) ──
    await loginAsAdmin(page);

    // ── Step 3: Navigate to admin dashboard ──
    await page.goto("/admin/multihopper");
    await page.waitForLoadState("domcontentloaded");

    // Verify admin page loaded (not redirected)
    await expect(page).toHaveURL(/admin\/multihopper/);
    console.log("Admin dashboard loaded");

    // ── Step 4: Verify Token Config tab is visible ──
    await expect(
      page.getByRole("button", { name: "Token Config", exact: true })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /Token Config/ })).toBeVisible({
      timeout: 10_000,
    });

    // ── Step 5: Find and modify fee percentage ──
    const feeInput = page.locator('input[placeholder="5.0"]');
    await feeInput.waitFor({ state: "visible", timeout: 5_000 });
    await feeInput.clear();
    await feeInput.fill("2.0");
    console.log("Fee percentage set to 2.0%");

    // ── Step 6: Modify max hops ──
    const maxHopsInput = page.locator('input[placeholder="5"]');
    await maxHopsInput.clear();
    await maxHopsInput.fill("8");
    console.log("Max hops set to 8");

    // ── Step 7: Submit the form ──
    // Button text depends on whether config exists
    const submitBtn = page.locator(
      'button:has-text("Initialize Token Config"), button:has-text("Update Token Config")'
    );
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();
    console.log("Token config form submitted");

    // ── Step 8: Wait for success or error toast ──
    // react-hot-toast renders toasts; wait for either outcome
    const successToast = page.getByText(/Token config (updated|created) successfully/i);
    const errorToast = page.getByText(/Token config (update|creation) failed/i);

    const outcome = await Promise.race([
      successToast.waitFor({ state: "visible", timeout: 30_000 }).then(() => "success" as const),
      errorToast.waitFor({ state: "visible", timeout: 30_000 }).then(() => "error" as const),
    ]);

    if (outcome === "error") {
      const errorText = await errorToast.textContent();
      throw new Error(`Token config update failed with toast: ${errorText}`);
    }

    await expect(successToast).toBeVisible();
    console.log("Token config update succeeded (toast confirmed)");

    // ── Step 9: Verify updated values via API (poll until on-chain state settles) ──
    let configJson: any;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      configJson = JSON.parse(solana("get-token-config"));
      console.log("Token config from API:", JSON.stringify(configJson));
      if (configJson.feeBps === "2" && configJson.maxHops === "8") break;
      await page.waitForTimeout(2_000);
    }
    // SPL endpoint returns feeBps as percentage (raw / 10,000): 2.0% → "2"
    expect(configJson.feeBps).toBe("2");
    expect(configJson.maxHops).toBe("8");
    console.log("Token config values verified via API:", configJson);

    // ── Step 10: Verify updated values persist in UI on reload ──
    await page.goto("/admin/multihopper");
    await page.waitForLoadState("domcontentloaded");

    const feeInputReloaded = page.locator('input[placeholder="5.0"]');
    await feeInputReloaded.waitFor({ state: "visible", timeout: 5_000 });
    await expect(feeInputReloaded).toHaveValue("2");

    const maxHopsReloaded = page.locator('input[placeholder="5"]');
    await expect(maxHopsReloaded).toHaveValue("8");
    console.log("Updated values confirmed in UI after reload");
  });
});
