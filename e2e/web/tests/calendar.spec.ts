import { expect, test, type Locator, type Page } from "@playwright/test";

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

/** Deletes through the event details and its confirmation, and returns the toast that offers Undo. */
async function deleteEvent(page: Page, title: string, scanConfirm = false) {
  await eventButton(page, title).click();
  await page.getByRole("dialog", { name: "Event details" }).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: `Delete “${title}”?` });
  await expect(confirm).toContainText("It moves to Trash for 30 days.");
  if (scanConfirm) await expectNoSeriousViolations(page, "calendar-delete-confirm");
  await confirm.getByRole("button", { name: "Delete event" }).click();
  await expect(eventButton(page, title)).toHaveCount(0);
  return page.getByRole("region", { name: /^Notifications/ }).getByRole("listitem").filter({ hasText: "Event moved to Trash" });
}

/** Sonner pauses a toast under the pointer, so the pointer leaves before waiting for toasts that would cover events. */
async function settleToasts(page: Page) {
  await page.mouse.move(0, 0);
  await expect(page.getByRole("region", { name: /^Notifications/ }).getByRole("listitem")).toHaveCount(0, { timeout: 15_000 });
}

async function openTrash(page: Page) {
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("dialog", { name: "Command Palette" }).getByRole("option", { name: /^Calendar Management/ }).click();
  await page.getByRole("dialog", { name: "Calendar Management" }).getByRole("button", { name: "Trash" }).click();
  return page.getByRole("dialog", { name: "Trash" });
}

function trashRow(trash: Locator, title: string) {
  return trash.getByRole("listitem").filter({ hasText: title });
}

test.beforeEach(async ({ page }) => {
  const { email, password } = readFixture();
  await signIn(page, email, password);
});

test("week view and the event editor pass axe in both themes; quick add fills the date from the title", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoSeriousViolations(page, `calendar-week-${colorScheme}`);
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("button", { name: "New event" }).click();
  const editor = page.getByRole("dialog", { name: "Create event" });
  await expect(editor).toBeVisible();
  await expectNoSeriousViolations(page, "calendar-editor");

  await editor.getByLabel("Event title").fill("Playwright quick add today all day");
  await editor.getByRole("button", { name: /^Use .*All day/ }).click();
  await expect(editor.getByLabel("Event title")).toHaveValue("Playwright quick add");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  await expect(eventButton(page, "Playwright quick add")).toHaveAccessibleName(/^Playwright quick add, All day/);
});

test("create, edit and delete events; the edit survives a reload; deletes undo and restore from Trash", async ({ page }) => {
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
  await (await deleteEvent(page, "Playwright deleted event", true)).getByRole("button", { name: "Undo" }).click();
  await expect(eventButton(page, "Playwright deleted event")).toBeVisible();
  await settleToasts(page);

  await (await deleteEvent(page, "Playwright deleted event")).getByRole("button", { name: "Close toast" }).click();
  let trash = await openTrash(page);
  await expectNoSeriousViolations(page, "calendar-trash");
  await trashRow(trash, "Playwright deleted event").getByRole("button", { name: "Restore" }).click();
  await expect(trashRow(trash, "Playwright deleted event")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(eventButton(page, "Playwright deleted event")).toBeVisible();
  await settleToasts(page);

  await (await deleteEvent(page, "Playwright deleted event")).getByRole("button", { name: "Close toast" }).click();
  trash = await openTrash(page);
  await trashRow(trash, "Playwright deleted event").getByRole("button", { name: "Delete forever" }).click();
  await page
    .getByRole("dialog", { name: "Delete “Playwright deleted event” forever?" })
    .getByRole("button", { name: "Delete forever" })
    .click();
  await expect(trashRow(trash, "Playwright deleted event")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(eventButton(page, "Playwright deleted event")).toHaveCount(0);
  await expect(eventButton(page, "Playwright kept event")).toBeVisible();
});
