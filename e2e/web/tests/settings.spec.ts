import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations } from "../support/axe";
import { readFixture } from "../support/fixture";
import { signIn, waitForWorkspace } from "../support/session";

async function openCalendarDefaults(page: Page) {
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("dialog", { name: "Command Palette" }).getByRole("option", { name: /^Calendar Defaults/ }).click();
  return page.getByRole("dialog", { name: "Calendar Defaults" });
}

/** Working days are sealed preferences, so a reload proves the encrypted settings round trip. */
async function toggleSaturday(page: Page, expected: "true" | "false") {
  const saturday = (await openCalendarDefaults(page)).getByRole("button", { name: "Saturday" });
  const saved = page.waitForResponse(
    (response) => response.url().endsWith("/api/settings") && response.request().method() === "PUT" && response.ok(),
  );
  await saturday.click();
  await expect(saturday).toHaveAttribute("aria-pressed", expected);
  await saved;
  await page.reload();
  await waitForWorkspace(page);
  await expect((await openCalendarDefaults(page)).getByRole("button", { name: "Saturday" })).toHaveAttribute(
    "aria-pressed",
    expected,
  );
}

test("command palette settings persist sealed across a reload", async ({ page }) => {
  const { email, password } = readFixture();
  await signIn(page, email, password);

  await openCalendarDefaults(page);
  await expectNoSeriousViolations(page, "settings-calendar-defaults");
  await page.keyboard.press("Escape");

  await toggleSaturday(page, "true");
  await page.keyboard.press("Escape");
  await toggleSaturday(page, "false");
});
