import { test, expect } from "@playwright/test";

test.describe("Contextual spellcheck demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demos/spellcheck.html");
    // Textarea is enabled immediately (rules work without model).
    await page.waitForFunction(() => {
      const el = document.querySelector("#draft");
      return el && !el.disabled;
    });
  });

  test("catches homophone: 'I'll see you their tomorrow'", async ({ page }) => {
    await page.locator("#draft").fill("I'll see you their tomorrow");
    // Wait for suggestions to appear
    await expect(page.locator("#t-count")).not.toHaveText("0", { timeout: 3000 });
    // Should have a chip for "their → there"
    const theirChip = page.locator(".suggest", { hasText: "their" });
    await expect(theirChip).toBeVisible();
    await expect(theirChip.locator(".to")).toHaveText("there");
  });

  test("catches misspelling: 'recieve'", async ({ page }) => {
    await page.locator("#draft").fill("I recieve your message");
    await expect(page.locator("#t-count")).not.toHaveText("0", { timeout: 3000 });
    const chip = page.locator(".suggest", { hasText: "recieve" });
    await expect(chip).toBeVisible();
    await expect(chip.locator(".to")).toHaveText("receive");
  });

  test("clean text shows no rule-based issues", async ({ page }) => {
    await page.locator("#draft").fill("The cat sat on the mat.");
    // Wait past the debounce
    await page.waitForTimeout(300);
    // Rules-only: no confusables, no homophones → "looks clean"
    // (The model may add suggestions later, but the initial rules pass is clean)
    await expect(page.locator("#suggestions-out")).toHaveText(/looks clean|no issues/);
  });

  test("clicking a suggestion chip applies the fix", async ({ page }) => {
    await page.locator("#draft").fill("I recieve your message");
    const chip = page.locator(".suggest", { hasText: "recieve" });
    await expect(chip).toBeVisible({ timeout: 3000 });
    await chip.click();
    await expect(page.locator("#draft")).toHaveValue("I receive your message");
  });

  test("catches 'teh' typo", async ({ page }) => {
    await page.locator("#draft").fill("teh quick brown fox");
    await expect(page.locator("#t-count")).not.toHaveText("0", { timeout: 3000 });
    const chip = page.locator(".suggest", { hasText: "teh" });
    await expect(chip).toBeVisible();
    await expect(chip.locator(".to")).toHaveText("the");
  });

  test("shows telemetry after suggestions", async ({ page }) => {
    await page.locator("#draft").fill("Your welcome");
    await expect(page.locator("#t-count")).not.toHaveText("0", { timeout: 3000 });
    await expect(page.locator("#t-source")).toHaveText("rule");
    const ms = await page.locator("#t-ms").textContent();
    expect(ms).toContain("ms");
  });

  test("catches multiple confusables in one sentence", async ({ page }) => {
    await page.locator("#draft").fill("I recieve the package tommorow and it will seperate");
    await expect(page.locator("#t-count")).not.toHaveText("0", { timeout: 3000 });
    // Should flag recieve, tommorow, and seperate
    await expect(page.locator(".suggest", { hasText: "recieve" })).toBeVisible();
    await expect(page.locator(".suggest", { hasText: "tommorow" })).toBeVisible();
    await expect(page.locator(".suggest", { hasText: "seperate" })).toBeVisible();
  });
});
