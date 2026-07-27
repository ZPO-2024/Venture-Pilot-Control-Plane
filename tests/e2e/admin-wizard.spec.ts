import { test, expect } from "@playwright/test";
import { ADMIN_URL, ADMIN_TOKEN } from "./helpers.js";

test.describe("admin pilot-creation wizard", () => {
  test("product -> version -> customer -> template -> roles/features -> provision -> invite", async ({ page }) => {
    await page.goto(ADMIN_URL);

    await page.fill('input[placeholder="Admin token"]', ADMIN_TOKEN);
    await page.click('button:has-text("Connect")');
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    await page.click('a:has-text("New pilot")');
    await expect(page.getByText("Select a product")).toBeVisible();

    await page.locator('label:has-text("ForgeFlow") input[type=radio]').check();
    await page.click('button:has-text("Next")');
    await expect(page.getByText(/Select a version/)).toBeVisible();

    await page.locator('label:has-text("0.1.0-demo") input[type=radio]').first().check();
    await page.click('button:has-text("Next")');
    await expect(page.getByText("Prospect / customer organization")).toBeVisible();

    const orgName = `E2E Wizard Org ${Date.now()}`;
    await page.fill('input[placeholder="Organization name"]', orgName);
    await page.fill('input[placeholder="Primary contact email"]', "e2e-wizard@example.com");
    await page.click('button:has-text("Next")');
    await expect(page.getByText("Demonstration template")).toBeVisible();

    await page.click('button:has-text("Next")');
    await expect(page.getByText("Feature set", { exact: true })).toBeVisible();

    const participantEmail = `e2e-wizard-participant-${Date.now()}@example.com`;
    await page.fill('input[placeholder="email"]', participantEmail);
    await page.click('button:has-text("Next")');
    await expect(page.getByRole("button", { name: "Provision & invite" })).toBeVisible();

    await page.click('button:has-text("Provision & invite")');
    await expect(page.getByText("Invitation links (shown once")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(participantEmail)).toBeVisible();
    // A raw invitation token is a base64url string with no separators; assert one rendered.
    await expect(page.locator("code").first()).not.toBeEmpty();

    await page.click('button:has-text("Go to pilot detail")');
    await expect(page.getByText("Participants & grants")).toBeVisible();
    await expect(page.getByText(orgName).first()).toBeVisible();

    await page.click('button:has-text("audit")');
    await expect(page.getByText("pilot.created")).toBeVisible();
    await expect(page.getByText(/ready_to_invited/)).toBeVisible();
  });
});
