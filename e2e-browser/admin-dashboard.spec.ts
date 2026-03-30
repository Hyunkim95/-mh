import { test, expect } from "@playwright/test";
import { solana, login, loginAsAdmin } from "./helpers";

test.describe("Admin Dashboard - Navigation & UI", () => {
  test.beforeAll(async () => {
    solana("ensure-balance 5");
    // Reset role to 'user' in case a previous run left it as 'admin'
    try { solana("set-user-role"); } catch { /* user may not exist yet */ }
  });

  // Non-admin test MUST run first, before set-admin-role is ever called
  test("should redirect non-admin users away from admin dashboard", async ({
    page,
  }) => {
    // Login as regular user (don't set admin role for this test)
    await login(page);

    // Try to navigate to admin
    await page.goto("/admin/multihopper");
    await page.waitForLoadState("domcontentloaded");

    // Should redirect to /my-assets (RoleGuardHOC redirects insufficient role)
    await page.waitForURL("**/my-assets", { timeout: 10_000 });
    console.log("Non-admin correctly redirected to /my-assets");
  });

  test("should load admin dashboard and navigate all tabs", async ({
    page,
  }) => {
    // ── Step 1: Login as admin (login → set-admin-role → re-login) ──
    await loginAsAdmin(page);

    // ── Step 3: Navigate to admin dashboard ──
    await page.goto("/admin/multihopper");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/admin\/multihopper/);
    console.log("Admin dashboard loaded");

    // ── Step 4: Verify 3 tabs are visible (use exact text to avoid matching submit buttons) ──
    const tokenConfigTab = page.getByRole("button", { name: "Token Config", exact: true });
    const routesTab = page.getByRole("button", { name: "Routes", exact: true });
    const hopsTab = page.getByRole("button", { name: "Hops", exact: true });
    await expect(tokenConfigTab).toBeVisible();
    await expect(routesTab).toBeVisible();
    await expect(hopsTab).toBeVisible();
    console.log("All 3 tabs visible");

    // ── Step 5: Token Config tab (default) ──
    // Verify form fields are present
    await expect(page.locator("text=Fee Percentage")).toBeVisible();
    await expect(page.locator("text=Fee Treasury Address")).toBeVisible();
    await expect(page.locator("text=Maximum Hops")).toBeVisible();
    await expect(page.locator("text=Flat Fee")).toBeVisible();
    console.log("Token Config tab: form fields visible");

    // ── Step 6: Click Routes tab ──
    await routesTab.click();
    await page.waitForTimeout(1_000);

    // Verify route create forms (SPL and SOL cards)
    await expect(page.locator("text=SPL").first()).toBeVisible();
    await expect(page.locator("text=SOL").first()).toBeVisible();
    await expect(page.locator("text=Create SPL Route")).toBeVisible();
    await expect(page.locator("text=Create SOL Route")).toBeVisible();
    await expect(page.locator("text=Amount per hop").first()).toBeVisible();
    await expect(page.locator("text=Route Hops").first()).toBeVisible();
    console.log("Routes tab: SPL and SOL route forms visible with fields");

    // ── Step 7: Click Hops tab ──
    await hopsTab.click();
    await page.waitForTimeout(1_000);
    await expect(page.locator("text=Your Hops")).toBeVisible();
    console.log("Hops tab loaded with content");

    // ── Step 8: Go back to Token Config tab ──
    await tokenConfigTab.click();
    await expect(
      page.getByRole("heading", { name: /Token Config/ })
    ).toBeVisible({ timeout: 10_000 });
    console.log("Returned to Token Config tab");
  });
});
