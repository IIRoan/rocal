import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectNoSeriousViolations } from "../support/axe";
import { readFixture } from "../support/fixture";
import { signIn, waitForWorkspace } from "../support/session";

async function openCalendarDefaults(page: Page) {
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("dialog", { name: "Command Palette" }).getByRole("option", { name: /^Calendar Defaults/ }).click();
  return page.getByRole("dialog", { name: "Calendar Defaults" });
}

/** Working days and the shortcuts switch are sealed preferences, so a reload proves the encrypted settings round trip. */
async function toggleAcrossReload(
  page: Page,
  control: (panel: Locator) => Locator,
  attribute: "aria-pressed" | "aria-checked",
  expected: "true" | "false",
) {
  const toggle = control(await openCalendarDefaults(page));
  const saved = page.waitForResponse(
    (response) => response.url().endsWith("/api/settings") && response.request().method() === "PUT" && response.ok(),
  );
  await toggle.click();
  await expect(toggle).toHaveAttribute(attribute, expected);
  await saved;
  await page.reload();
  await waitForWorkspace(page);
  const panel = await openCalendarDefaults(page);
  await expect(control(panel)).toHaveAttribute(attribute, expected);
  await page.keyboard.press("Escape");
  // Shortcuts ignore keys pressed inside a dialog, so the next key waits for the palette to close.
  await expect(panel).toBeHidden();
}

const saturday = (panel: Locator) => panel.getByRole("button", { name: "Saturday" });
const shortcutsSwitch = (panel: Locator) => panel.getByRole("switch", { name: /^Keyboard shortcuts/ });

test("command palette settings persist sealed across a reload; the shortcuts switch turns single keys off", async ({ page }) => {
  const { email, password } = readFixture();
  await signIn(page, email, password);
  await openCalendarDefaults(page);
  await expectNoSeriousViolations(page, "settings-calendar-defaults");
  await page.keyboard.press("Escape");

  await toggleAcrossReload(page, saturday, "aria-pressed", "true");
  await toggleAcrossReload(page, saturday, "aria-pressed", "false");

  const viewButton = (name: string) => page.getByRole("button", { name, exact: true });

  await toggleAcrossReload(page, shortcutsSwitch, "aria-checked", "false");
  await page.keyboard.press("m");
  await expect(viewButton("Week")).toHaveAttribute("aria-pressed", "true");

  await toggleAcrossReload(page, shortcutsSwitch, "aria-checked", "true");
  await page.keyboard.press("m");
  await expect(viewButton("Month")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("w");
  await expect(viewButton("Week")).toHaveAttribute("aria-pressed", "true");
});
