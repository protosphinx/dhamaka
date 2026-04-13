import { test, expect } from "@playwright/test";

test.describe("Contextual spellcheck demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demos/spellcheck.html");
    await page.waitForFunction(() => !!document.querySelector("#draft"));
  });

  test("catches homophone: 'I'll see you their tomorrow'", async ({ page }) => {
    await page.locator("#draft").fill("I'll see you their tomorrow");
    // SmartText has an 80ms debounce — wait for suggestions to appear
    await expect(page.locator("#t-count")).not.toHaveText("0", { timeout: 3000 });
    // Should show a suggestion chip with "their → there"
    const chip = page.locator(".suggest").first();
    await expect(chip).toBeVisible();
    await expect(chip.locator(".strike")).toHaveText("their");
    await expect(chip.locator(".to")).toHaveText("there");
  });

  test("catches misspelling: 'recieve'", async ({ page }) => {
    await page.locator("#draft").fill("I recieve your message");
    await expect(page.locator("#t-count")).not.toHaveText("0", { timeout: 3000 });
    const chip = page.locator(".suggest").first();
    await expect(chip).toBeVisible();
    await expect(chip.locator(".strike")).toHaveText("recieve");
    await expect(chip.locator(".to")).toHaveText("receive");
  });

  test("clean text shows no issues", async ({ page }) => {
    await page.locator("#draft").fill("This sentence is perfectly fine.");
    // Wait past the debounce
    await page.waitForTimeout(200);
    await expect(page.locator("#suggestions-out")).toHaveText("no issues");
  });

  test("clicking a suggestion chip applies the fix", async ({ page }) => {
    await page.locator("#draft").fill("I recieve your message");
    await expect(page.locator(".suggest").first()).toBeVisible({ timeout: 3000 });
    // Click the suggestion chip to apply the fix
    await page.locator(".suggest").first().click();
    // The textarea should now have the corrected text
    await expect(page.locator("#draft")).toHaveValue("I receive your message");
  });

  test("catches 'teh' typo", async ({ page }) => {
    await page.locator("#draft").fill("teh quick brown fox");
    await expect(page.locator("#t-count")).not.toHaveText("0", { timeout: 3000 });
    const chip = page.locator(".suggest").first();
    await expect(chip.locator(".strike")).toHaveText("teh");
    await expect(chip.locator(".to")).toHaveText("the");
  });

  test("shows telemetry after suggestions", async ({ page }) => {
    await page.locator("#draft").fill("Your welcome");
    await expect(page.locator("#t-count")).not.toHaveText("0", { timeout: 3000 });
    await expect(page.locator("#t-source")).toHaveText("rule");
    const ms = await page.locator("#t-ms").textContent();
    expect(ms).toContain("ms");
  });
});
