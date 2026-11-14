import { expect, test } from "@playwright/test";

import { expectNoSeriousViolations } from "../support/axe";
import { readFixture } from "../support/fixture";
import { signIn, signOut, waitForWorkspace } from "../support/session";

test("invite sign-up initializes encryption and a new sign-in unlocks it", async ({ page }) => {
  const { inviteToken, inviteEmail, invitePassword } = readFixture();
  const [localPart = "", domain = ""] = inviteEmail.split("@");

  await page.goto(`/login?invite=${encodeURIComponent(inviteToken)}&next=%2Fcalendar`);
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
  await expect(page.getByText(`@${domain}`, { exact: true })).toBeVisible();
  await expectNoSeriousViolations(page, "login-sign-up");

  await page.getByLabel("Full name").fill("Playwright Browser");
  await page.getByLabel("Solace email").fill(localPart);
  await expect(page.getByText("This address is available.")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(invitePassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/calendar", { timeout: 60_000 });
  await waitForWorkspace(page);

  await signOut(page);
  await expectNoSeriousViolations(page, "login-sign-in");
  await signIn(page, inviteEmail, invitePassword);
});
