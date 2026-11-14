import { expect, test } from "@playwright/test";

import { expectNoSeriousViolations } from "../support/axe";
import { readFixture } from "../support/fixture";
import { signIn } from "../support/session";

test("send encrypted mail to self, then receive and decrypt it", async ({ page }) => {
  const { email, password } = readFixture();
  await signIn(page, email, password, "/mail");
  await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Compose" }).click();
  const compose = page.getByRole("dialog", { name: "New mail" });
  await expectNoSeriousViolations(page, "mail-compose");
  await compose.getByRole("combobox", { name: "To" }).fill(email);
  await compose.getByRole("combobox", { name: "To" }).press("Enter");
  await compose.getByRole("textbox", { name: "Subject" }).fill("Playwright message");
  await compose.getByRole("textbox", { name: "Message body" }).fill("Playwright body text");
  await compose.getByRole("button", { name: "Send" }).click();
  await expect(compose).toBeHidden();

  const row = page.getByRole("main").getByRole("button", { name: /Playwright message/ }).first();
  await expect(async () => {
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(row).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoSeriousViolations(page, `mail-inbox-${colorScheme}`);
  }
  await page.emulateMedia({ colorScheme: "light" });

  await row.click();
  await expect(page.getByRole("heading", { name: /^Playwright message/, level: 2 })).toBeVisible();
  await expect(page.frameLocator('iframe[title="Email body"]').getByText("Playwright body text")).toBeVisible();
  await expectNoSeriousViolations(page, "mail-reader");
});
