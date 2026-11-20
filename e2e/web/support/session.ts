import { expect, type Page } from "@playwright/test";

/** Waits until no route, auth or encryption loading overlay covers the page and every finite animation ended. */
export async function waitForWorkspace(page: Page) {
  await expect(page.locator("[data-page-loading-overlay]")).toHaveCount(0, { timeout: 60_000 });
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
}

/** Signs in on a fresh page, which unlocks the account key from the password envelope as a new device. */
export async function signIn(page: Page, email: string, password: string, next = "/calendar") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Account email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname === next, { timeout: 60_000 });
  await waitForWorkspace(page);
}

export async function signOut(page: Page) {
  await page.goto("/home");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/login");
  await waitForWorkspace(page);
}
