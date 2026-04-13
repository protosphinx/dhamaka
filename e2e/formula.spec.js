import { test, expect } from "@playwright/test";

test.describe("Formula editor demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demos/formula.html");
  });

  test("spreadsheet renders with initial data", async ({ page }) => {
    // Should show the sheet with data
    const cells = page.locator("table.sheet td");
    await expect(cells.first()).toBeVisible();
    // D2 should have a formula (marked with has-formula class)
    const d2 = page.locator('td[data-id="D2"]');
    await expect(d2).toHaveClass(/has-formula/);
  });

  test("clicking a cell selects it and shows formula", async ({ page }) => {
    await page.locator('td[data-id="D2"]').click();
    await expect(page.locator("#cell-addr")).toHaveText("D2");
    await expect(page.locator("#formula-input")).toHaveValue("=B2 + C2");
  });

  test("'add a 10% discount' rewrites the formula", async ({ page }) => {
    await page.locator('td[data-id="D2"]').click();
    await page.locator("#ai-input").fill("add a 10% discount");
    await page.locator("#ai-run").click();
    // The before-after panel should show the transformation
    await expect(page.locator("#ba-old")).toHaveText("=B2 + C2");
    await expect(page.locator("#ba-new")).toContainText("0.9");
  });

  test("suggestion chips work", async ({ page }) => {
    await page.locator('td[data-id="E2"]').click();
    // Click "round to 2 decimals" chip
    await page.locator('.chip[data-inst="round to 2 decimals"]').click();
    await expect(page.locator("#ba-new")).toContainText("ROUND");
  });

  test("non-formula cell shows warning", async ({ page }) => {
    // A1 is "Region" — no formula
    await page.locator('td[data-id="A1"]').click();
    await page.locator("#ai-input").fill("add a 10% discount");
    await page.locator("#ai-run").click();
    await expect(page.locator("#ba-why")).toContainText("formula");
  });
});
