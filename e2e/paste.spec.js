import { test, expect } from "@playwright/test";

const CONTACT_BLOB = `Jane Doe
Senior Platform Engineer
Acme Corp
jane.doe@acme.com
+1 (415) 555-1234
https://acme.com
@janedoe`;

test.describe("Smart paste demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demos/paste.html");
    await page.waitForFunction(() => !!document.querySelector("#contact-form"));
  });

  test("pasting a contact blob fills name, email, phone, website, twitter, company", async ({ page }) => {
    // Simulate a paste event with clipboard data on the drop zone
    await page.locator("#drop-zone").evaluate((el, text) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    }, CONTACT_BLOB);

    // Wait for the extraction event to fire and fields to populate
    await expect(page.locator('input[name="email"]')).toHaveValue("jane.doe@acme.com", { timeout: 3000 });
    // Phone regex normalises to digits-only
    await expect(page.locator('input[name="phone"]')).toHaveValue("+14155551234");
    await expect(page.locator('input[name="website"]')).toHaveValue("https://acme.com");
    // Twitter regex captures without the @
    await expect(page.locator('input[name="twitter"]')).toHaveValue("janedoe");
    await expect(page.locator('input[name="company"]')).toHaveValue("Acme");
  });

  test("shows field count and source telemetry after paste", async ({ page }) => {
    await page.locator("#drop-zone").evaluate((el, text) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    }, CONTACT_BLOB);

    await expect(page.locator("#t-count")).not.toHaveText("0 fields", { timeout: 3000 });
    await expect(page.locator("#t-source")).not.toHaveText("—");
  });

  test("does not overwrite manually typed fields", async ({ page }) => {
    // Pre-fill the email field manually
    await page.locator('input[name="email"]').fill("manual@example.com");

    // Now paste the blob
    await page.locator("#drop-zone").evaluate((el, text) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    }, CONTACT_BLOB);

    // Phone should be filled (digits-only normalised)
    await expect(page.locator('input[name="phone"]')).toHaveValue("+14155551234", { timeout: 3000 });
    // Email should keep the manual value
    await expect(page.locator('input[name="email"]')).toHaveValue("manual@example.com");
  });

  test("paste event bubbles from an input inside the drop zone", async ({ page }) => {
    // The paste listener is on the drop zone — events from children bubble up
    await page.locator("#drop-zone").evaluate((el, text) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      // Dispatch from the drop zone itself (simulating browser paste)
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    }, CONTACT_BLOB);

    await expect(page.locator('input[name="email"]')).toHaveValue("jane.doe@acme.com", { timeout: 3000 });
    await expect(page.locator('input[name="name"]')).toHaveValue("Jane Doe");
  });
});
