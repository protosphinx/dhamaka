import { test, expect } from "@playwright/test";

test.describe("Address autofill demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demos/autofill.html");
    // Wait for the SDK module to initialize
    await page.waitForFunction(() => !!document.querySelector("#city"));
  });

  test("typing 'San Francisco' fills state, country, timezone, currency", async ({ page }) => {
    const city = page.locator("#city");
    await city.fill("San Francisco");
    // SmartField fires on input — give it a moment to propagate
    await expect(page.locator("#state")).toHaveValue("California", { timeout: 3000 });
    await expect(page.locator("#country")).toHaveValue("United States");
    await expect(page.locator("#timezone")).toHaveValue("America/Los_Angeles");
    await expect(page.locator("#currency")).toHaveValue("USD");
  });

  test("alias 'sf' resolves to San Francisco", async ({ page }) => {
    await page.locator("#city").fill("sf");
    await expect(page.locator("#state")).toHaveValue("California", { timeout: 3000 });
  });

  test("Tokyo resolves to Japan", async ({ page }) => {
    await page.locator("#city").fill("Tokyo");
    await expect(page.locator("#country")).toHaveValue("Japan", { timeout: 3000 });
    await expect(page.locator("#currency")).toHaveValue("JPY");
  });

  test("Berlin resolves to Germany", async ({ page }) => {
    await page.locator("#city").fill("Berlin");
    await expect(page.locator("#country")).toHaveValue("Germany", { timeout: 3000 });
  });

  test("fuzzy match: typo 'San Francsico' still resolves", async ({ page }) => {
    await page.locator("#city").fill("San Francsico");
    await expect(page.locator("#state")).toHaveValue("California", { timeout: 3000 });
  });

  test("shows source and confidence telemetry", async ({ page }) => {
    await page.locator("#city").fill("San Francisco");
    await expect(page.locator("#t-source")).not.toHaveText("—", { timeout: 3000 });
    const conf = await page.locator("#t-conf").textContent();
    expect(parseFloat(conf)).toBeGreaterThan(0);
  });

  test("typing keystroke-by-keystroke triggers live updates", async ({ page }) => {
    const city = page.locator("#city");
    // Type letter by letter to simulate real keystrokes
    await city.pressSequentially("Tokyo", { delay: 50 });
    await expect(page.locator("#country")).toHaveValue("Japan", { timeout: 3000 });
  });

  test("clearing the city field does not crash", async ({ page }) => {
    const city = page.locator("#city");
    await city.fill("Berlin");
    await expect(page.locator("#country")).toHaveValue("Germany", { timeout: 3000 });
    await city.fill("");
    // Should not throw — fields may retain old values or clear, but no error
    await page.waitForTimeout(200);
    // Page should still be functional
    await city.fill("Tokyo");
    await expect(page.locator("#country")).toHaveValue("Japan", { timeout: 3000 });
  });
});
