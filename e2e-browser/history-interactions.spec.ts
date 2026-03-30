import { test, expect } from "@playwright/test";
import { solana, login } from "./helpers";

test.describe("History Page - Summary & Expand/Collapse", () => {
  test.beforeAll(async () => {
    solana("ensure-balance 5");
  });

  test("should display route summary with correct counts", async ({
    page,
  }) => {
    await login(page);

    await page.goto("/history");
    await page.waitForLoadState("domcontentloaded");

    // Wait for at least one route item to appear (previous specs created routes)
    const firstRoute = page.locator('[data-testid^="route-item-"]').first();
    await firstRoute.waitFor({ state: "visible", timeout: 15_000 });

    // Verify summary section is visible with expected format
    const summary = page.locator('[data-testid="history-summary"]');
    await expect(summary).toBeVisible();
    const summaryText = await summary.textContent();
    expect(summaryText).toMatch(/\d+ routes completed & \d+ pending/);
    console.log(`History summary: ${summaryText}`);
  });

  test("should expand and collapse a route to show hop details", async ({
    page,
  }) => {
    await login(page);

    await page.goto("/history");
    await page.waitForLoadState("domcontentloaded");

    // Wait for first route item
    const firstRoute = page.locator('[data-testid^="route-item-"]').first();
    await firstRoute.waitFor({ state: "visible", timeout: 15_000 });

    // Extract route ID from data-testid
    const testId = await firstRoute.getAttribute("data-testid");
    const routeId = testId?.replace("route-item-", "");
    expect(routeId).toBeTruthy();
    console.log(`Testing expand/collapse for route ${routeId}`);

    // Detail section should NOT be visible initially
    const detail = page.locator(`[data-testid="route-detail-${routeId}"]`);
    await expect(detail).not.toBeVisible();

    // Click the route header button to expand
    const toggleBtn = firstRoute.locator("button").first();
    await toggleBtn.click();
    await page.waitForTimeout(500);

    // Detail section should now be visible
    await expect(detail).toBeVisible();
    console.log("Route expanded — detail section visible");

    // Verify at least one Solscan link in the expanded section
    const solscanLink = detail.locator('a[href*="solscan.io"]').first();
    await expect(solscanLink).toBeVisible();
    console.log("Solscan link found in expanded hop details");

    // Click again to collapse
    await toggleBtn.click();
    await page.waitForTimeout(500);

    // Detail section should be hidden again
    await expect(detail).not.toBeVisible();
    console.log("Route collapsed — detail section hidden");
  });
});
