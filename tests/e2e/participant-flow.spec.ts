import { test, expect } from "@playwright/test";
import { PORTAL_URL, seedPilotWithInvitation } from "./helpers.js";

test.describe("participant redeem-to-feedback flow", () => {
  test("redeem -> explore -> complete workflow -> submit feedback -> request extension/export -> sign out", async ({ page }) => {
    const seeded = await seedPilotWithInvitation();

    await page.goto(`${PORTAL_URL}/redeem/${seeded.rawInvitationToken}`);
    await page.waitForURL(PORTAL_URL + "/", { timeout: 10_000 });
    await expect(page.getByText("synthetic and fabricated")).toBeVisible();

    const exploreButtons = page.locator('button:has-text("Explore")');
    await expect(exploreButtons.first()).toBeVisible();
    await exploreButtons.first().click();

    await page.click('button:has-text("Mark demonstration workflow complete")');
    await expect(page.getByText("Demonstration workflow marked complete.")).toBeVisible();

    await page.fill("textarea", "E2E: this trial experience was smooth.");
    await page.click('button:has-text("Submit")');
    await expect(page.getByText(/Thanks — your feedback was submitted/)).toBeVisible();

    await page.click('button:has-text("Request extension")');
    await expect(page.getByText(/Request extension requested/)).toBeVisible();

    await page.click('button:has-text("Request data export")');
    await expect(page.getByText(/Request data export requested/)).toBeVisible();

    await page.click('button:has-text("Sign out")');
    await expect(page.getByText("No active trial session")).toBeVisible();

    // Confirm the signed-out state survives a reload (session token cleared).
    await page.reload();
    await expect(page.getByText("No active trial session")).toBeVisible();
  });

  test("redeeming an already-used invitation link shows a clear error, not a crash", async ({ page }) => {
    const seeded = await seedPilotWithInvitation();

    await page.goto(`${PORTAL_URL}/redeem/${seeded.rawInvitationToken}`);
    await page.waitForURL(PORTAL_URL + "/", { timeout: 10_000 });
    await page.click('button:has-text("Sign out")');
    await expect(page.getByText("No active trial session")).toBeVisible();

    // localStorage now has no session token, so visiting the same
    // (already-redeemed) link again must hit the API and fail cleanly.
    await page.goto(`${PORTAL_URL}/redeem/${seeded.rawInvitationToken}`);
    await expect(page.getByText("Invitation not valid")).toBeVisible();
    await expect(page.getByText(/already been used/)).toBeVisible();
  });
});
