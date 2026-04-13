// Browser-level benchmarks via Playwright.
//
// Measures real end-to-end latency as a user would experience it:
// page load → SDK init → type in a field → result appears.

import { test, expect } from "@playwright/test";

test.describe("Browser benchmarks", () => {
  test("autofill: page load to first interactive result", async ({ page }) => {
    const t0 = Date.now();
    await page.goto("/demos/autofill.html");
    const loadMs = Date.now() - t0;

    const t1 = Date.now();
    await page.locator("#city").fill("San Francisco");
    await expect(page.locator("#state")).toHaveValue("California", { timeout: 5000 });
    const resolveMs = Date.now() - t1;

    // Read the SDK's own timing
    const sdkMs = await page.locator("#t-ms").textContent();

    console.log(`  [autofill] page load: ${loadMs} ms`);
    console.log(`  [autofill] type → result: ${resolveMs} ms`);
    console.log(`  [autofill] SDK self-report: ${sdkMs}`);
    expect(resolveMs).toBeLessThan(500);
  });

  test("autofill: 10 sequential city lookups", async ({ page }) => {
    await page.goto("/demos/autofill.html");
    const cities = [
      "San Francisco", "Tokyo", "Berlin", "London", "Paris",
      "Sydney", "Toronto", "Mumbai", "Seoul", "sf",
    ];

    const t0 = Date.now();
    for (const city of cities) {
      await page.locator("#city").fill(city);
      await expect(page.locator("#state")).not.toHaveValue("", { timeout: 3000 });
    }
    const totalMs = Date.now() - t0;
    const avgMs = totalMs / cities.length;

    console.log(`  [autofill] 10 lookups total: ${totalMs} ms`);
    console.log(`  [autofill] avg per lookup: ${avgMs.toFixed(1)} ms`);
    expect(avgMs).toBeLessThan(200);
  });

  test("spellcheck: type → suggestion visible", async ({ page }) => {
    await page.goto("/demos/spellcheck.html");

    const t0 = Date.now();
    await page.locator("#draft").fill("I'll see you their tomorrow");
    await expect(page.locator(".suggest").first()).toBeVisible({ timeout: 3000 });
    const resolveMs = Date.now() - t0;

    const sdkMs = await page.locator("#t-ms").textContent();
    console.log(`  [spellcheck] type → suggestion: ${resolveMs} ms`);
    console.log(`  [spellcheck] SDK self-report: ${sdkMs}`);
    // Includes 80ms debounce
    expect(resolveMs).toBeLessThan(500);
  });

  test("spellcheck: apply fix round-trip", async ({ page }) => {
    await page.goto("/demos/spellcheck.html");
    await page.locator("#draft").fill("I recieve your message");
    await expect(page.locator(".suggest").first()).toBeVisible({ timeout: 3000 });

    const t0 = Date.now();
    await page.locator(".suggest").first().click();
    await expect(page.locator("#draft")).toHaveValue("I receive your message");
    const fixMs = Date.now() - t0;

    console.log(`  [spellcheck] click fix → applied: ${fixMs} ms`);
    expect(fixMs).toBeLessThan(500);
  });

  test("paste: blob → fields populated", async ({ page }) => {
    await page.goto("/demos/paste.html");

    const blob = `Jane Doe\nSenior Platform Engineer\nAcme Corp\njane.doe@acme.com\n+1 (415) 555-1234\nhttps://acme.com\n@janedoe`;

    const t0 = Date.now();
    await page.locator("#drop-zone").evaluate((el, text) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    }, blob);
    await expect(page.locator('input[name="email"]')).toHaveValue("jane.doe@acme.com", { timeout: 3000 });
    const resolveMs = Date.now() - t0;

    console.log(`  [paste] blob → fields: ${resolveMs} ms`);
    expect(resolveMs).toBeLessThan(500);
  });

  test("SDK bundle: no unexpected network requests after load", async ({ page }) => {
    const requests = [];
    page.on("request", (req) => requests.push(req.url()));

    await page.goto("/demos/autofill.html");
    await page.locator("#city").fill("Tokyo");
    await expect(page.locator("#country")).toHaveValue("Japan", { timeout: 3000 });

    // Filter to only non-localhost requests (there should be none)
    const external = requests.filter((u) => !u.includes("localhost"));
    console.log(`  [network] total requests: ${requests.length}`);
    console.log(`  [network] external requests: ${external.length}`);
    expect(external.length).toBe(0);
  });
});
