import { test, expect } from "@playwright/test";
import { blockAnalytics, checkNoHorizontalOverflow } from "./helpers";

test.describe.serial("Funnel smoke test", () => {
  test.beforeEach(async ({ page }) => {
    await blockAnalytics(page);
  });

  test("landing page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/.+/);
    await checkNoHorizontalOverflow(page);
  });

  test("signup page loads", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveTitle(/.+/);
    await checkNoHorizontalOverflow(page);
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/.+/);
    await checkNoHorizontalOverflow(page);
  });

  test("settings page loads", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveTitle(/.+/);
    await checkNoHorizontalOverflow(page);
  });

  test("scout page loads", async ({ page }) => {
    await page.goto("/scout");
    await expect(page).toHaveTitle(/.+/);
    await checkNoHorizontalOverflow(page);
  });

  test("scout-report page loads", async ({ page }) => {
    await page.goto("/scout-report");
    await expect(page).toHaveTitle(/.+/);
    await checkNoHorizontalOverflow(page);
  });

  test("forge page loads", async ({ page }) => {
    await page.goto("/forge");
    await expect(page).toHaveTitle(/.+/);
    await checkNoHorizontalOverflow(page);
  });

  test("forge-report page loads", async ({ page }) => {
    await page.goto("/forge-report");
    await expect(page).toHaveTitle(/.+/);
    await checkNoHorizontalOverflow(page);
  });

  test("prove page loads", async ({ page }) => {
    await page.goto("/prove");
    await expect(page).toHaveTitle(/.+/);
    await checkNoHorizontalOverflow(page);
  });

  test("prove-report page loads", async ({ page }) => {
    await page.goto("/prove-report");
    await expect(page).toHaveTitle(/.+/);
    await checkNoHorizontalOverflow(page);
  });

  // Variant smoke tests
  test("variant full-pipeline loads", async ({ page }) => {
    await page.goto("/v/full-pipeline");
    await expect(page).toHaveTitle(/.+/);
    await checkNoHorizontalOverflow(page);
  });

  test("variant byok-value loads", async ({ page }) => {
    await page.goto("/v/byok-value");
    await expect(page).toHaveTitle(/.+/);
    await checkNoHorizontalOverflow(page);
  });
});
