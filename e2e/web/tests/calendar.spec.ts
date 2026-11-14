import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations } from "../support/axe";
import { readFixture } from "../support/fixture";
import { signIn, waitForWorkspace } from "../support/session";

function eventButton(page: Page, title: string) {
  return page.getByRole("main").getByRole("button", { name: new RegExp(`^${title},`) });
}

async function createEvent(page: Page, title: string) {
  await page.getByRole("button", { name: "New event" }).click();
  const editor = page.getByRole("dialog", { name: "Create event" });
  await editor.getByLabel("Event title").fill(title);
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  await expect(eventButton(page, title)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  const { email, password } = readFixture();
  await signIn(page, email, password);
});

test("week view and the event editor pass axe in both themes", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoSeriousViolations(page, `calendar-week-${colorScheme}`);
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("button", { name: "New event" }).click();
  await expect(page.getByRole("dialog", { name: "Create event" })).toBeVisible();
  await expectNoSeriousViolations(page, "calendar-editor");
});

test("create, edit and delete events; the edit survives a reload", async ({ page }) => {
  await createEvent(page, "Playwright event");

  await eventButton(page, "Playwright event").click();
  await page.getByRole("dialog", { name: "Event details" }).getByRole("button", { name: "Edit" }).click();
  const editor = page.getByRole("dialog", { name: "Edit event" });
  await editor.getByLabel("Event title").fill("Playwright kept event");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(eventButton(page, "Playwright kept event")).toBeVisible();

  await page.reload();
  await waitForWorkspace(page);
  await expect(eventButton(page, "Playwright kept event")).toBeVisible();
  await expect(eventButton(page, "Playwright event")).toHaveCount(0);

  await createEvent(page, "Playwright deleted event");
  await eventButton(page, "Playwright deleted event").click();
  await page.getByRole("dialog", { name: "Event details" }).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete “Playwright deleted event”?" });
  await expectNoSeriousViolations(page, "calendar-delete-confirm");
  await confirm.getByRole("button", { name: "Delete event" }).click();
  await expect(eventButton(page, "Playwright deleted event")).toHaveCount(0);
  await expect(eventButton(page, "Playwright kept event")).toBeVisible();
});
