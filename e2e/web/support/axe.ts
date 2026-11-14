import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

import { e2eDirectory } from "./fixture";
import { waitForWorkspace } from "./session";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Fails on serious or critical WCAG 2.2 AA violations; the summary names rules only, never page content. */
export async function expectNoSeriousViolations(page: Page, name: string) {
  await waitForWorkspace(page);
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    // The sender's HTML renders in a script-less sandbox that axe cannot enter.
    .exclude('iframe[title="Email body"]')
    .analyze();
  const serious = violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map(({ id, impact, help, nodes }) => ({ id, impact, help, nodeCount: nodes.length }));
  const directory = path.join(e2eDirectory(), "artifacts/web/axe");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(serious, null, 2));
  expect(serious, `axe found serious violations on ${name}`).toEqual([]);
}
