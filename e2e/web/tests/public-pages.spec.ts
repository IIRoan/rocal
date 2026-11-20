import { expect, test } from "@playwright/test";

import { expectNoSeriousViolations } from "../support/axe";

for (const path of ["/privacy", "/support", "/licenses"]) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSeriousViolations(page, path.slice(1));
  });
}
