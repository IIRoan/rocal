import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const DAY_MS = 24 * 60 * 60 * 1000;

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function gateCopy(): string {
  const match = read("apps/stalwart/backend-gate.cfg").match(
    /lf-string "([^"]*)" if \{ path \/\.well-known\/security\.txt \}/,
  );
  if (!match?.[1]) throw new Error("backend-gate.cfg has no security.txt lf-string");
  return match[1].replaceAll("\\n", "\n");
}

describe("security.txt", () => {
  const web = read("apps/web/public/.well-known/security.txt");
  const api = read("apps/backend/security.txt");

  it("is identical on the web, API and mail hosts", () => {
    expect(api).toBe(web);
    expect(gateCopy()).toBe(web);
  });

  it("names a contact, a policy and every canonical location", () => {
    const lines = web.trimEnd().split("\n");
    expect(lines.some((line) => line.startsWith("Contact: mailto:"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Policy: https://"))).toBe(true);
    for (const host of ["solace.onl", "api.solace.onl", "mail.solace.onl"]) {
      expect(lines).toContain(`Canonical: https://${host}/.well-known/security.txt`);
    }
  });

  it("expires between 60 days and a year from now", () => {
    const expires = web.match(/^Expires: (.+)$/gm) ?? [];
    expect(expires).toHaveLength(1);
    const remaining = Date.parse(expires[0]?.slice("Expires: ".length) ?? "") - Date.now();
    if (!(remaining >= 60 * DAY_MS)) {
      throw new Error("security.txt expires within 60 days; move Expires forward in all three copies");
    }
    expect(remaining).toBeLessThanOrEqual(366 * DAY_MS);
  });
});
