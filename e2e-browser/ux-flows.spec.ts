import { test, expect } from "@playwright/test";
import { solana, login, selectTokenAndConfigure } from "./helpers";

test.describe("UX Flows - Logout, 404, Navigation, Amount Shortcuts", () => {
  test.beforeAll(async () => {
    solana("ensure-balance 5");
    solana("init-token-config");
  });

  test("should show 404 page for unknown routes", async ({ page }) => {
    await page.goto("/nonexistent-page-xyz");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.locator("h1")).toContainText("404");
    await expect(page.locator("text=Page not found")).toBeVisible();

    const backLink = page.locator('a:has-text("Back to home")');
    await expect(backLink).toBeVisible();
    await backLink.click();
    await page.waitForURL("**/", { timeout: 10_000 });
    console.log("404 page works correctly with back link");
  });

  test("should handle /configure-hops without asset param", async ({
    page,
  }) => {
    await login(page);

    await page.goto("/configure-hops");
    await page.waitForLoadState("domcontentloaded");

    // Should stay on configure-hops (not redirected)
    expect(page.url()).toContain("/configure-hops");

    // Next step button should be disabled without an asset selected
    const nextBtn = page.locator('[data-testid="next-step-btn"]');
    await expect(nextBtn).toBeDisabled({ timeout: 5_000 });
    console.log("/configure-hops without asset: next-step-btn is disabled");
  });

  test("should log out and redirect to login", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/my-assets/);

    // Click logout
    const logoutBtn = page.locator('[data-testid="logout-btn"]');
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Should redirect to /login
    await page.waitForURL("**/login", { timeout: 10_000 });
    console.log("Redirected to /login after logout");

    // Token should be cleared
    const token = await page.evaluate(() => localStorage.getItem("token"));
    expect(token).toBeNull();
    console.log("Token cleared from localStorage");

    // Navigating to /my-assets should show login UI (AuthHOC renders <Login />)
    await page.goto("/my-assets");
    await page.waitForLoadState("domcontentloaded");
    const walletTile = page.locator('[data-testid="wallet-tile-test-wallet"]');
    await expect(walletTile).toBeVisible({ timeout: 10_000 });
    console.log("Protected route shows login UI after logout");
  });

  test("should set amount with Max and percentage buttons", async ({
    page,
  }) => {
    await login(page);
    await selectTokenAndConfigure(page, "SOL");

    // Wait for amount display to be ready
    const amountDisplay = page.locator('[data-testid="amount-display"]');
    await amountDisplay.waitFor({ state: "visible", timeout: 10_000 });

    // Click Max button
    const maxBtn = page.locator('[data-testid="amount-shortcut-max"]');
    await maxBtn.click();
    await page.waitForTimeout(500);

    // Amount should be > 0
    const maxText = await amountDisplay.textContent();
    const maxAmount = parseFloat(maxText?.replace(/,/g, "") || "0");
    expect(maxAmount).toBeGreaterThan(0);
    console.log(`Max amount: ${maxAmount}`);

    // Click 25% button
    const btn25 = page.locator('[data-testid="amount-shortcut-25"]');
    await btn25.click();
    await page.waitForTimeout(500);

    // Amount should be smaller but still > 0
    const quarterText = await amountDisplay.textContent();
    const quarterAmount = parseFloat(quarterText?.replace(/,/g, "") || "0");
    expect(quarterAmount).toBeGreaterThan(0);
    expect(quarterAmount).toBeLessThan(maxAmount);
    console.log(`25% amount: ${quarterAmount} (less than max ${maxAmount})`);
  });
});
